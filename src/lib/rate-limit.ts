import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { headers } from "next/headers"

const redis = Redis.fromEnv()


export const publicOrderRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "rl:public-order",
  analytics: true,
})


export const removeBgRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "rl:remove-bg",
  analytics: true,
})


export const apiInventoryRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "rl:api-inventory",
  analytics: true,
})


export const leadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  prefix: "rl:lead",
  analytics: true,
})

// Asistente IA del admin: cada request puede encadenar varias llamadas al LLM
// (bucle de herramientas), así que el límite es por hora y por restaurante.
export const assistantRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "rl:assistant",
  analytics: true,
})

// TODAS las funciones de IA de la plataforma (chat de Manuel, importar menú,
// sugerir receta, mapear CSV de inventario) comparten UNA sola
// GEMINI_API_KEY. Sin un presupuesto agregado y COMPARTIDO entre las 4, una
// ráfaga de importaciones de menú en un restaurante puede agotar la cuota
// real de Gemini y hacer que Manuel devuelva 429 en otro restaurante que
// nunca tocó el chat — antes, ninguna de las otras 3 pasaba por ningún límite
// propio. Este es ese presupuesto único: frecuencia global independiente de
// cuál de las 4 funciones o cuántos restaurantes distintos la generen.
export const geminiGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(Number(process.env.ASSISTANT_GLOBAL_RATE_LIMIT) || 20, "1 m"),
  prefix: "rl:gemini-global",
  analytics: true,
})

// Límites propios (por restaurante) de las 3 funciones de IA NO
// conversacionales — antes no tenían ninguno, así que un solo restaurante
// podía por sí solo consumir buena parte del presupuesto global de arriba.
// Números bajos porque son operaciones pesadas/ocasionales, no chat.
export const menuImportRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "rl:menu-import",
  analytics: true,
})
export const recipeAiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "rl:recipe-ai",
  analytics: true,
})
export const inventoryAiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:inventory-ai",
  analytics: true,
})

// Complemento al límite de frecuencia: cuántas conversaciones del asistente
// pueden estar EN VUELO al mismo tiempo (cada una puede tardar hasta
// maxDuration=300s y hacer varias llamadas secuenciales a Gemini) — sin esto,
// una ráfaga de usuarios distintos podría seguir sumando llamadas simultáneas
// mientras las anteriores aún no terminan, aunque cada una respete el límite
// de frecuencia por minuto. Default subido de 6 a 10: con 6, bastaban 6-7
// admins con Manuel abierto a la vez (normal en hora punta) para que el resto
// de la plataforma recibiera 429 sin que hubiera abuso real. Si la cuota real
// de Gemini sigue en tier gratis (~10 RPM), subir esto NO alcanza por sí solo
// — hay que revisar el plan contratado en Google AI Studio.
const ASSISTANT_MAX_CONCURRENCY = Number(process.env.ASSISTANT_MAX_CONCURRENCY) || 10
const ASSISTANT_CONCURRENCY_KEY = "rl:assistant:inflight"
// Red de seguridad: si un proceso muere sin liberar su cupo, el contador no
// debe quedar atascado para siempre. Mismo orden de magnitud que maxDuration.
const ASSISTANT_CONCURRENCY_TTL_SECONDS = 300

/** Segundos hasta el `reset` (timestamp ms) de un Ratelimit — para el header/campo Retry-After. */
export function secondsUntilReset(resetMs: number): number {
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
}

export async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  return h.get("x-real-ip")?.trim() || "unknown"
}

export async function checkPublicOrderLimit(qrToken: string) {
  const ip = await getClientIp()
  const key = `${ip}:qr:${qrToken}`
  return publicOrderRatelimit.limit(key)
}

export async function checkRemoveBgLimit(userId: string) {
  return removeBgRatelimit.limit(`user:${userId}`)
}

/**
 * Rate limit de la API pública de inventario. Se acota por IP + prefijo de la
 * API key (nunca la key completa, que no debe quedar en Redis), frenando la
 * fuerza bruta de tokens y el abuso sin exponer el secreto.
 */
export async function checkApiInventoryLimit(token: string) {
  const ip = await getClientIp()
  const keyPrefix = token.slice(0, 13)
  return apiInventoryRatelimit.limit(`${ip}:${keyPrefix}`)
}

/** Anti-spam del formulario público de leads: por IP. */
export async function checkLeadLimit() {
  const ip = await getClientIp()
  return leadRatelimit.limit(`ip:${ip}`)
}

/** Asistente IA: por restaurante (todos los admins del local comparten cupo). */
export async function checkAssistantLimit(restaurantId: number) {
  return assistantRatelimit.limit(`restaurant:${restaurantId}`)
}

/** Presupuesto de Gemini: frecuencia agregada de LAS 4 funciones de IA, en TODOS los restaurantes juntos. */
export async function checkGeminiGlobalLimit() {
  return geminiGlobalRatelimit.limit("global")
}

/** Importar menú con IA: por restaurante (operación pesada y ocasional). */
export async function checkMenuImportLimit(restaurantId: number) {
  return menuImportRatelimit.limit(`restaurant:${restaurantId}`)
}

/** Sugerir receta con IA: por restaurante. */
export async function checkRecipeAiLimit(restaurantId: number) {
  return recipeAiRatelimit.limit(`restaurant:${restaurantId}`)
}

/** Mapear columnas de inventario con IA: por restaurante. */
export async function checkInventoryAiLimit(restaurantId: number) {
  return inventoryAiRatelimit.limit(`restaurant:${restaurantId}`)
}

/**
 * Reserva un cupo de conversación activa del asistente; false si ya hay
 * ASSISTANT_MAX_CONCURRENCY conversaciones en vuelo. Debe liberarse siempre
 * con releaseAssistantSlot() cuando el que sí obtuvo cupo termine (éxito o
 * error) — normalmente en un finally.
 */
export async function acquireAssistantSlot(): Promise<boolean> {
  try {
    const current = await redis.incr(ASSISTANT_CONCURRENCY_KEY)
    if (current === 1) {
      await redis.expire(ASSISTANT_CONCURRENCY_KEY, ASSISTANT_CONCURRENCY_TTL_SECONDS)
    }
    if (current > ASSISTANT_MAX_CONCURRENCY) {
      await releaseAssistantSlot()
      return false
    }
    return true
  } catch {
    // Si Redis no responde, no bloqueamos el asistente por eso (fail-open,
    // mismo criterio que el resto de los rate limits del repo).
    return true
  }
}

export async function releaseAssistantSlot(): Promise<void> {
  try {
    const value = await redis.decr(ASSISTANT_CONCURRENCY_KEY)
    if (value < 0) await redis.set(ASSISTANT_CONCURRENCY_KEY, 0)
  } catch {
    // no crítico — a lo sumo el contador queda algo desincronizado hasta el TTL
  }
}