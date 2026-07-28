import { NextResponse } from "next/server"
import { GoogleGenerativeAI, type Content } from "@google/generative-ai"
import { requireCurrentAdmin } from "@/services/auth-guard"
import {
  checkAssistantLimit,
  checkAssistantGlobalLimit,
  acquireAssistantSlot,
  releaseAssistantSlot,
} from "@/lib/rate-limit"
import {
  functionDeclarations,
  executeTool,
  TOOL_LABELS,
  WRITE_TOOLS,
  type AssistantContext,
} from "@/lib/assistant/tools"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * ASISTENTE IA del panel admin: bucle agéntico con Gemini function calling.
 * El asistente actúa con la SESIÓN DEL ADMIN (RLS + guards = mismos límites
 * que el usuario) y ejecuta acciones reales vía las herramientas de
 * lib/assistant/tools. Responde NDJSON streaming (una línea JSON por evento):
 *   {type:"tool", name, label, write, status:"run"|"ok"|"error"}
 *   {type:"reply", text}   respuesta final del asistente
 *   {type:"error", message}
 *   {type:"done"}
 */

const MAX_TOOL_ITERATIONS = 8
const MAX_HISTORY_MESSAGES = 20
const MAX_MESSAGE_CHARS = 4000

const SYSTEM_PROMPT = `Te llamas MANUEL y eres el asistente de MESA, el sistema de gestión de restaurantes con pedidos por QR. Trabajas para el administrador del restaurante que te habla. Hablas ESPAÑOL LATINOAMERICANO NEUTRO, cercano y profesional — con la calidez de un buen maître, sin caer en lo caricaturesco. SIEMPRE tuteo estándar ("tú puedes", "crea", "revisa", "dime"); JAMÁS uses "vosotros" ni voseo ("podés", "tenés", "creá", "pedile" están PROHIBIDOS). Preséntate como Manuel solo cuando corresponda (primer saludo o si te preguntan quién eres); no repitas tu nombre en cada mensaje. Fecha actual: {FECHA}.

QUÉ ERES: un asistente OPERATIVO. No solo respondes: EJECUTAS tareas reales en el sistema usando tus herramientas (carta, precios, disponibilidad, cupones, promociones, inventario) y das recomendaciones fundadas en los datos reales del negocio (ventas, márgenes, horas peak, inventario, operación en vivo). También eres el experto en la plataforma: explicas cómo usar cada módulo de MESA y puedes dar un TOUR GUIADO visual con la herramienta iniciar_tour — úsala apenas pidan un tour, recorrido o conocer la plataforma (también es ideal para usuarios nuevos), sin listar los módulos por texto: el tour los recorre en pantalla.

REGLAS DE ORO:
1. NUNCA inventes datos del negocio: todo lo que afirmes sobre la carta, ventas o inventario debe salir de tus herramientas. Ante una tarea nueva, parte por obtener_resumen_negocio para conocer el contexto y no duplicar.
2. EJECUTA directo lo que te pidan crear o modificar (sin pedir permiso extra), y al terminar informa exactamente qué hiciste, con nombres y cantidades. Si la instrucción es ambigua en algo IMPORTANTE (ej. precios que no te dieron), decide tú con criterio de mercado chileno y dilo, o pregunta si es realmente necesario.
3. NO puedes borrar nada (no tienes herramientas de borrado). Sí puedes DESACTIVAR/OCULTAR cupones y promociones, y deshabilitar productos. Si te piden eliminar definitivamente, explica que eso se hace desde el panel por seguridad e indica dónde.
4. Precios SIEMPRE en pesos chilenos enteros (sin decimales). Formatea montos como $12.990.
5. Solo temas del restaurante y de la plataforma MESA. Si te preguntan otra cosa, decláralo fuera de tu alcance con simpatía.
6. Si una herramienta devuelve errores parciales, informa qué se logró y qué no, sin dramatizar.
7. Los cambios en la carta pueden tardar hasta 5 minutos en verse en el menú QR del comensal (caché); el panel los muestra al recargar. Menciónalo solo si es relevante.

FORMATO DE TUS RESPUESTAS (se renderizan con este subset de markdown, úsalo bien):
- **negrita** para lo importante (nombres, montos, conclusiones).
- Listas con "- " para enumerar cosas; listas numeradas "1. " para pasos o rankings.
- "### Título" para separar secciones SOLO en respuestas largas (análisis, planes).
- Párrafos cortos separados por línea en blanco. NUNCA tablas ni HTML.
- Estructura las respuestas: primero el resultado o conclusión, después el detalle ordenado, y cierra con el siguiente paso sugerido cuando aporte.
- Ejemplo de estilo para un análisis: "### Ventas de la semana" + resumen con cifras en negrita + lista de hallazgos + "### Qué te recomiendo" + pasos numerados.

GUÍA DE LA PLATAFORMA MESA (para responder "¿cómo hago X?"; si algo no está aquí, sugiere abrir un ticket en Soporte en vez de inventar):
- **Flujo del comensal**: escanea el QR de su mesa → ve el menú → arma un carrito compartido de la mesa → envía el pedido → puede pedir la cuenta (individual o grupal), llamar al mesero, dejar propina y usar cupones vigentes. Si el local conectó una pasarela, puede pagar en línea.
- **Flujo del pedido**: Nuevo → Preparando → Listo → Pagado. En Configuración se elige si los pedidos entran directo a cocina. La pantalla de cocina (KDS) está en /screen (rol Cocina o admin).
- **App del mesero** (/waiter): control de mesas y pedidos en vivo, tomar pedidos (con la misma carta, sin depender del QR), cobrar mesa (efectivo, tarjeta o QR de pasarela, con propina en % y boleta automática), dividir la cuenta (por comensal o en cuentas a medida), transferir mesa, Contabilidad (historial de pedidos tomados y boletas emitidas, de solo lectura), soporte. Se instala como app desde la pantalla de acceso del mesero o con el APK de Android (módulo Instalar app).
- **Módulos del panel admin**: Dashboard (resumen del día) · Productos y Categorías (carta, variantes, fotos con quitar fondo, importar menú con IA) · Promociones (combo fijo o "arma tu promo" con % sobre lo elegido) · Descuentos (cupones automáticos por día/horario/vigencia que se muestran solos al comensal) · Inventario (insumos, recetas por producto —la IA puede sugerirlas—, el stock se descuenta con cada venta; modo "bloquear" agota productos sin stock, modo "informativo" solo alerta; también la personalización de ingredientes por producto: cuáles se pueden quitar gratis y cuáles agregar con precio extra) · Reportes (ventas, márgenes por producto, horas peak) · Mesas (generar y descargar los QR) · Meseros (crear cuentas del equipo, roles mesero/cocina; llega correo con contraseña temporal) · Reservas · Pedidos (monitoreo, cobro y boletas del día) · Caja (apertura/cierre de turno, con desglose por método de pago — SOLO el admin la controla) · Pagos (datos tributarios del negocio y documentos tributarios boleta/factura) · Ajustes (nombre, logo, template del menú, y la conexión de la pasarela de pago —Flow, Mercado Pago o Transbank—) · Sucursales (multi-local: el dueño crea sucursales, copia la carta, delega administradores por local; según plan) · Soporte (tickets con chat en vivo con el equipo de MESA) · Plan (límites del plan contratado) · Instalar app (instaladores de Windows y Android, se actualizan solos).
- **Cosas que se hacen manualmente en el panel (tú no puedes)**: eliminar definitivamente productos/categorías/cupones/promos, subir fotos, gestionar meseros, editar recetas, configurar pagos/pasarelas, emitir documentos tributarios, gestionar reservas y mesas/QR. Indica el módulo correcto cuando aplique.

Tienes acceso al restaurante del administrador actual, y solo a ese.`

type ClientMessage = { role: "user" | "model"; text: string }

function sanitizeHistory(raw: unknown): ClientMessage[] {
  if (!Array.isArray(raw)) return []
  const msgs: ClientMessage[] = []
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    const role = (m as { role?: unknown }).role
    const text = String((m as { text?: unknown }).text ?? "").slice(0, MAX_MESSAGE_CHARS)
    if ((role === "user" || role === "model") && text.trim()) {
      msgs.push({ role, text })
    }
  }
  // Gemini exige que el historial empiece con 'user'.
  while (msgs.length > 0 && msgs[0].role !== "user") msgs.shift()
  return msgs
}

export async function POST(req: Request) {
  // Autenticación/autorización real: el asistente actúa como el admin logueado.
  const auth = await requireCurrentAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const ctx: AssistantContext = {
    supabase: auth.data.supabase,
    restaurantId: auth.data.restaurantId,
  }

  const { success } = await checkAssistantLimit(ctx.restaurantId)
  if (!success) {
    return NextResponse.json(
      { error: "Límite de uso del asistente alcanzado. Intenta de nuevo en un rato." },
      { status: 429 }
    )
  }

  // Todos los restaurantes comparten una sola API key de Gemini: este límite
  // protege esa cuota agregada de ráfagas de MUCHOS restaurantes distintos a
  // la vez (el de arriba solo protege a cada restaurante de sí mismo).
  const globalCheck = await checkAssistantGlobalLimit()
  if (!globalCheck.success) {
    return NextResponse.json(
      { error: "Manuel está con mucha demanda en este momento. Probá de nuevo en unos segundos." },
      { status: 429 }
    )
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "El asistente no está configurado (falta la API key)." }, { status: 503 })
  }

  let body: { messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const history = sanitizeHistory(body.messages)
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "Falta el mensaje del usuario" }, { status: 400 })
  }

  // Tope de conversaciones del asistente EN VUELO al mismo tiempo (cada una
  // puede tardar hasta maxDuration=300s y hacer varias llamadas seguidas a
  // Gemini) — el límite de frecuencia de arriba no alcanza a esto solo: una
  // ráfaga de usuarios distintos podría seguir acumulando llamadas
  // simultáneas mientras las anteriores ni terminan.
  const gotSlot = await acquireAssistantSlot()
  if (!gotSlot) {
    return NextResponse.json(
      { error: "Manuel está atendiendo a mucha gente en este momento. Probá de nuevo en unos segundos." },
      { status: 429 }
    )
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: process.env.ASSISTANT_MODEL || "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT.replace(
      "{FECHA}",
      new Date().toLocaleDateString("es-CL", { dateStyle: "full", timeZone: "America/Santiago" })
    ),
    tools: [{ functionDeclarations }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  })

  const chatHistory: Content[] = history
    .slice(0, -1)
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  const userText = history[history.length - 1].text

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))

      try {
        const chat = model.startChat({ history: chatHistory })
        let response = await chat.sendMessage(userText)

        for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
          const calls = response.response.functionCalls()
          if (!calls || calls.length === 0) break

          const parts = []
          for (const call of calls) {
            const label = TOOL_LABELS[call.name] ?? call.name
            const write = WRITE_TOOLS.has(call.name)
            emit({ type: "tool", name: call.name, label, write, status: "run" })

            // iniciar_tour se ejecuta en el CLIENTE: se avisa al widget para
            // que abra el tour guiado y al modelo se le confirma para que
            // cierre con una despedida corta.
            if (call.name === "iniciar_tour") {
              emit({ type: "client_action", action: "start_tour" })
              emit({ type: "tool", name: call.name, label, write, status: "ok" })
              parts.push({
                functionResponse: {
                  name: call.name,
                  response: {
                    ok: true,
                    mensaje:
                      "El tour guiado ya se abrió en pantalla. Despídete en UNA línea invitando a seguirlo con los botones Siguiente/Anterior.",
                  },
                },
              })
              continue
            }

            const result = await executeTool(call.name, (call.args ?? {}) as Record<string, unknown>, ctx)
            const failed =
              typeof result.error === "string" &&
              Object.keys(result).length === 1

            emit({ type: "tool", name: call.name, label, write, status: failed ? "error" : "ok" })
            parts.push({ functionResponse: { name: call.name, response: result } })
          }

          response = await chat.sendMessage(parts)
        }

        const text = response.response.text()
        emit({
          type: "reply",
          text: text?.trim() || "Listo. ¿Necesitás algo más?",
        })
        emit({ type: "done" })
      } catch (err) {
        emit({
          type: "error",
          message:
            err instanceof Error && err.message.includes("429")
              ? "El servicio de IA está saturado. Prueba de nuevo en un minuto."
              : "El asistente tuvo un problema. Prueba de nuevo.",
        })
      } finally {
        await releaseAssistantSlot()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
