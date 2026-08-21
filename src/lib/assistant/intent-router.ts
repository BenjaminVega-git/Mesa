import "server-only"
import { executeTool, type AssistantContext } from "./tools"
import { PLATFORM_FAQ } from "./platform-guide"

/**
 * Motor de intención determinístico: responde las preguntas/acciones más
 * frecuentes de un admin SIN pasar por Gemini, ejecutando la misma
 * `executeTool` de siempre (las tools son funciones TS normales, ajenas al
 * LLM) y armando la respuesta con un template en vez de dejar que el modelo
 * la redacte. Es la pieza que reduce la dependencia real de la cuota
 * compartida de Gemini para el tráfico más común — no un reemplazo del
 * asistente conversacional.
 *
 * Deliberadamente conservador y de SOLO LECTURA (más `iniciar_tour`, que no
 * modifica nada): si el mensaje no matchea con confianza alguno de los
 * patrones de abajo, se devuelve `null` y la conversación sigue por Gemini
 * exactamente como antes. Nunca se enruta ninguna tool de ESCRITURA acá — un
 * falso positivo de lectura muestra datos de más; uno de escritura crearía o
 * modificaría algo real sin que el admin lo haya pedido con esas palabras.
 */

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p))
}

// Solo mensajes cortos y autocontenidos — una pregunta de una línea, sin
// depender del contexto de turnos anteriores (el router no ve el historial).
const MAX_ROUTABLE_LENGTH = 140

// Señales de que la pregunta es más compleja de lo que un template puede
// responder bien (comparaciones, análisis, redacción libre) — ante cualquiera
// de estas, mejor dejarlo en manos de Gemini.
const COMPLEXITY_SIGNALS = [
  "compara",
  "versus",
  " vs ",
  "tendencia",
  "proyeccion",
  "por que",
  "recomienda",
  "deberia",
  "analiza",
]

function fmtDias(dias: number): string {
  if (dias === 1) return "hoy"
  if (dias === 7) return "en la última semana"
  if (dias === 30) return "en el último mes"
  return `en los últimos ${dias} días`
}

function detectDias(text: string): number | undefined {
  if (/\bhoy\b/.test(text)) return 1
  if (/\b(esta|la) semana\b|\bultima semana\b/.test(text)) return 7
  if (/\b(este|el) mes\b|\bultimo mes\b/.test(text)) return 30
  return undefined
}

type ReadRoute = {
  test: (text: string) => boolean
  tool: string
  args?: (text: string) => Record<string, unknown> | undefined
  format: (result: Record<string, unknown>, args: Record<string, unknown> | undefined) => string
}

const READ_ROUTES: ReadRoute[] = [
  {
    // "¿cómo va el día?", "¿tengo pedidos pendientes?"
    test: (t) =>
      /\b(como va|como esta) (el dia|mi dia|el negocio|todo)\b/.test(t) ||
      /\b(pedidos?) (pendientes|activos|en curso|dando vueltas)\b/.test(t) ||
      /\bcuantos pedidos\b.*\b(hay|tengo)\b/.test(t) ||
      /\bque pedidos (hay|tengo)\b/.test(t),
    tool: "estado_operacion_hoy",
    format: (r) => {
      const conteo = r.conteo_por_estado as { nuevos: number; preparando: number; listos: number }
      const pedidos = r.pedidos_activos as unknown[]
      const ventas = r.ventas_hoy as
        | { totalRevenue: number; orderCount: number; averageTicket: number }
        | { error: string }
      const lineas: string[] = []
      lineas.push(
        pedidos.length === 0
          ? "No tienes pedidos activos en este momento."
          : `Tienes **${conteo.nuevos}** pedido(s) nuevo(s), **${conteo.preparando}** en preparación y **${conteo.listos}** listo(s) para entregar (${pedidos.length} activos en total).`
      )
      if ("totalRevenue" in ventas) {
        lineas.push(
          `Ventas de hoy: **${clp.format(ventas.totalRevenue)}** en ${ventas.orderCount} pedido(s), ticket promedio ${clp.format(ventas.averageTicket)}.`
        )
      }
      return lineas.join("\n\n")
    },
  },
  {
    // "¿cuánto vendí hoy/esta semana/este mes?"
    test: (t) => /\bcuanto\b.*\bvend/.test(t) || (/\bventas\b/.test(t) && /\bcomo (estuvo|estuvieron)\b/.test(t)),
    tool: "obtener_reporte_ventas",
    args: (t) => {
      const dias = detectDias(t)
      return dias ? { dias } : undefined
    },
    format: (r, args) => {
      if (r.error) return `No pude calcular el reporte de ventas: ${String(r.error)}`
      const resumen = r.resumen as { totalRevenue: number; orderCount: number; averageTicket: number }
      const top = (r.top_productos as { productName: string; variantName: string | null; unitsSold: number; revenue: number }[]) ?? []
      const dias = (args?.dias as number | undefined) ?? 7
      const lineas = [
        `### Ventas ${fmtDias(dias)}`,
        `**${clp.format(resumen.totalRevenue)}** en **${resumen.orderCount}** pedido(s) — ticket promedio **${clp.format(resumen.averageTicket)}**.`,
      ]
      if (top.length > 0) {
        lineas.push(
          "Top productos:",
          ...top
            .slice(0, 5)
            .map((p, i) => `${i + 1}. **${p.productName}${p.variantName ? ` · ${p.variantName}` : ""}** — ${p.unitsSold} vendidos, ${clp.format(p.revenue)}`)
        )
      }
      return lineas.join("\n\n")
    },
  },
  {
    // "¿qué insumos se están acabando?", "¿tengo stock bajo?"
    test: (t) =>
      (/\binsumos?\b|\bstock\b/.test(t) && /\b(bajo|acabando|agotando)\b/.test(t)) ||
      /\balgo (sin stock|agotado)\b/.test(t),
    tool: "obtener_alertas_inventario",
    format: (r) => {
      const outCount = Number(r.out_count ?? 0)
      const lowCount = Number(r.low_count ?? 0)
      if (outCount === 0 && lowCount === 0) {
        return "Todo tu inventario está en buen nivel — ningún insumo agotado ni bajo mínimo."
      }
      const items = (r.items as { name: string; unit: string; stock_actual: number; stock_minimo: number; level: string }[]) ?? []
      const lineas = [`### Alertas de inventario`, `**${outCount}** insumo(s) agotado(s) y **${lowCount}** bajo el mínimo.`]
      lineas.push(
        ...items
          .slice(0, 15)
          .map((i) =>
            i.level === "sin_stock"
              ? `- **${i.name}**: agotado (0 ${i.unit})`
              : `- **${i.name}**: ${i.stock_actual}/${i.stock_minimo} ${i.unit} (bajo mínimo)`
          )
      )
      if (items.length > 15) lineas.push(`_+${items.length - 15} más — revisa el módulo Inventario._`)
      return lineas.join("\n")
    },
  },
  {
    // "muéstrame los cupones activos", "¿qué cupones tengo?"
    test: (t) => /\bcupones?\b/.test(t) && !/\b(crea|creame|nuevo|activa|desactiva)\b/.test(t),
    tool: "listar_cupones",
    format: (r) => {
      const cupones = (r.cupones as {
        code: string
        discount_type: "percent" | "amount"
        discount_value: number
        active: boolean
        available_now: boolean
      }[]) ?? []
      if (cupones.length === 0) return "No tienes cupones creados todavía."
      const lineas = ["### Tus cupones"]
      lineas.push(
        ...cupones.map((c) => {
          const valor = c.discount_type === "percent" ? `${c.discount_value}%` : clp.format(c.discount_value)
          const estado = !c.active ? " _(inactivo)_" : !c.available_now ? " _(fuera de horario/vigencia)_" : ""
          return `- **${c.code}** — ${valor} de descuento${estado}`
        })
      )
      return lineas.join("\n")
    },
  },
  {
    // "muéstrame las promociones", "¿qué promos tengo corriendo?"
    // \bpromos?\b (no solo \bpromos?) — sin el \b de cierre, matcheaba
    // "promo" como prefijo de cualquier palabra, incluida "promocional".
    test: (t) => /\bpromos?\b|\bpromociones\b/.test(t) && !/\b(crea|creame|nueva|activa|desactiva)\b/.test(t),
    tool: "listar_promociones",
    format: (r) => {
      const promos = (r.promociones as {
        name: string
        kind: "fixed" | "build" | "mixed"
        promo_price: number
        discount_type?: "percent" | "amount"
        discount_pct: number | null
        discount_amount?: number | null
        active: boolean
      }[]) ?? []
      if (promos.length === 0) return "No tienes promociones creadas todavía."
      const lineas = ["### Tus promociones"]
      lineas.push(
        ...promos.map((p) => {
          const detalle =
            p.kind === "fixed"
              ? clp.format(p.promo_price)
              : p.discount_type === "amount"
                ? `${clp.format(p.discount_amount ?? 0)} de descuento`
                : `${p.discount_pct ?? 0}% de descuento`
          const tipo =
            p.kind === "fixed" ? "combo fijo" : p.kind === "mixed" ? "promo mixta" : "arma tu promo"
          return `- **${p.name}** (${tipo}) — ${detalle}${p.active ? "" : " _(inactiva)_"}`
        })
      )
      return lineas.join("\n")
    },
  },
]

const TOUR_TRIGGERS = [
  "hazme un tour",
  "quiero un tour",
  "dame un tour",
  "un recorrido por",
  "como funciona mesa",
  "como funciona la plataforma",
  "como funciona el sistema",
  "explicame como funciona",
  "soy nuevo",
  "muestrame la plataforma",
]

export type DeterministicReply =
  | { kind: "tour" }
  | { kind: "faq"; reply: string }
  | { kind: "tool"; tool: string; reply: string }

/**
 * Intenta resolver el mensaje sin Gemini. Devuelve `null` si no hay match
 * confiable (la conversación sigue el camino normal con el LLM).
 */
export async function tryDeterministicReply(
  userText: string,
  ctx: AssistantContext
): Promise<DeterministicReply | null> {
  if (userText.length > MAX_ROUTABLE_LENGTH) return null
  const text = normalize(userText)
  if (includesAny(text, COMPLEXITY_SIGNALS)) return null

  if (includesAny(text, TOUR_TRIGGERS)) return { kind: "tour" }

  for (const faq of PLATFORM_FAQ) {
    if (includesAny(text, faq.triggers)) {
      return { kind: "faq", reply: faq.respuesta }
    }
  }

  for (const route of READ_ROUTES) {
    if (!route.test(text)) continue
    const args = route.args?.(text)
    const result = await executeTool(route.tool, args ?? {}, ctx)
    if (typeof result.error === "string" && Object.keys(result).length === 1) {
      // La tool falló (p.ej. error de BD) — mejor dejar que Gemini lo intente
      // y explique, en vez de mostrar un error crudo desde un template fijo.
      return null
    }
    return { kind: "tool", tool: route.tool, reply: route.format(result, args) }
  }

  return null
}
