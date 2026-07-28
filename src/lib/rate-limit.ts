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

// Todos los restaurantes comparten UNA sola GEMINI_API_KEY (ver también
// menu-import/recipe-ai/inventory-ai-service). El límite de arriba protege a
// cada restaurante de sí mismo, pero con muchos restaurantes distintos
// activos a la vez no hay ningún tope agregado sobre la cuota real — este es
// ese tope: frecuencia global (ráfagas en poco tiempo) independiente de
// cuántos restaurantes distintos las generen.
export const assistantGlobalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(Number(process.env.ASSISTANT_GLOBAL_RATE_LIMIT) || 20, "1 m"),
  prefix: "rl:assistant-global",
  analytics: true,
})

// Complemento al límite de frecuencia: cuántas conversaciones del asistente
// pueden estar EN VUELO al mismo tiempo (cada una puede tardar hasta
// maxDuration=300s y hacer varias llamadas secuenciales a Gemini) — sin esto,
// una ráfaga de usuarios distintos podría seguir sumando llamadas simultáneas
// mientras las anteriores aún no terminan, aunque cada una respete el límite
// de frecuencia por minuto.
const ASSISTANT_MAX_CONCURRENCY = Number(process.env.ASSISTANT_MAX_CONCURRENCY) || 6
const ASSISTANT_CONCURRENCY_KEY = "rl:assistant:inflight"
// Red de seguridad: si un proceso muere sin liberar su cupo, el contador no
// debe quedar atascado para siempre. Mismo orden de magnitud que maxDuration.
const ASSISTANT_CONCURRENCY_TTL_SECONDS = 300

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

/** Asistente IA: frecuencia agregada de TODOS los restaurantes juntos. */
export async function checkAssistantGlobalLimit() {
  return assistantGlobalRatelimit.limit("global")
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