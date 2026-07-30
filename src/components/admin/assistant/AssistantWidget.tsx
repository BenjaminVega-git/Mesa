"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Volume2, VolumeX, Compass, FolderTree, TrendingUp, Package, Ticket, type LucideIcon } from "lucide-react"
import { useVisibleModules } from "@/hooks/useVisibleModules"
import { TypewriterMarkdown } from "@/components/admin/assistant/TypewriterMarkdown"
import { ManuelAvatar } from "@/components/admin/assistant/ManuelAvatar"
import { TourOverlay } from "@/components/admin/assistant/TourOverlay"
import { speakText, stopSpeaking, speechAvailable } from "@/lib/assistant/voice"

/**
 * Asistente IA del panel admin: botón flotante + panel de chat. Ejecuta tareas
 * reales (crear categorías/productos, cupones, promos, precios, disponibilidad)
 * y da recomendaciones con los datos del negocio. Backend: /api/assistant
 * (bucle agéntico Gemini con la sesión del admin; NDJSON streaming).
 * Togglable por el operador vía platform_modules (clave 'asistente', fail-open).
 *
 * Lenguaje visual inspirado en Gemini (Material 3) adaptado a la marca MESA:
 * gradiente de acento, saludo con texto en gradiente, respuestas SIN burbuja
 * con el avatar al margen, shimmer mientras piensa, input tipo píldora y
 * tarjetas de sugerencia en grilla. Utilidades manuel-* en globals.css.
 */

type ActionChip = { label: string; write: boolean; status: "run" | "ok" | "error" }
type ChatMessage = { role: "user" | "assistant"; text: string; actions?: ActionChip[] }

const STORAGE_KEY = "mesa-assistant-chat"
const VOICE_KEY = "mesa-manuel-voice"

const SUGGESTIONS: { icon: LucideIcon; text: string }[] = [
  { icon: FolderTree, text: "Crea las categorías típicas para mi tipo de restaurante" },
  { icon: TrendingUp, text: "¿Qué me recomiendas para vender más?" },
  { icon: Package, text: "Revisa mi inventario y dime qué tengo que reponer" },
  { icon: Ticket, text: "Crea un cupón de 10% de descuento para los lunes" },
]

function loadStored(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Se restaura después de recargar/cerrar la pestaña: cualquier acción que
    // haya quedado "en ejecución" nunca va a resolver (el stream que la iba a
    // cerrar ya no existe), y si el turno se cortó antes del evento "reply"
    // no hay texto que mostrar — sin esto, quedaban chips parpadeando para
    // siempre y turnos completamente en blanco sin ningún aviso.
    return (parsed as ChatMessage[]).slice(-40).map((m) => {
      if (m.role !== "assistant") return m
      const actions = (m.actions ?? []).map((a) => (a.status === "run" ? { ...a, status: "error" as const } : a))
      const text = m.text || "La respuesta no llegó a completarse (se cortó la conexión). Intenta de nuevo."
      return { ...m, actions, text }
    })
  } catch {
    return []
  }
}

export function AssistantWidget() {
  const { isVisible } = useVisibleModules()
  const [open, setOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // Voz de Manuel (TTS del navegador): preferencia persistida + estado hablando.
  const [voiceOn, setVoiceOn] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const voiceOnRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Índice del mensaje recién llegado por el stream: es el ÚNICO que se
  // anima con el typewriter (el historial restaurado aparece completo).
  const freshReplyRef = useRef<number | null>(null)
  // Se incrementa en cada send() nuevo y en "Nueva conversación": un send()
  // en vuelo cuya generación ya no es la vigente deja de tocar el estado.
  // Sin esto, cancelar/vaciar el chat mientras Manuel respondía podía dejar
  // que la respuesta VIEJA (que llega después, ya en el catch/finally del
  // fetch abortado) sobrescribiera el turno nuevo, o reactivara `busy` de
  // golpe en medio de la conversación siguiente.
  const generationRef = useRef(0)

  // Cargar historial de la sesión + preferencia de voz al montar (evita
  // hydration mismatch).
  useEffect(() => {
    const stored = loadStored()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee sessionStorage tras montar
    setMessages(stored)
    setHydrated(true)
    try {
      const v = localStorage.getItem(VOICE_KEY) === "1" && speechAvailable()
      setVoiceOn(v)
      voiceOnRef.current = v
    } catch {
      // storage bloqueado: voz apagada
    }
  }, [])

  function toggleVoice() {
    const next = !voiceOn
    setVoiceOn(next)
    voiceOnRef.current = next
    try {
      localStorage.setItem(VOICE_KEY, next ? "1" : "0")
    } catch {
      // storage bloqueado: la preferencia dura la sesión
    }
    if (next) {
      speakText("¡Hola! Así suena mi voz.", {
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      })
    } else {
      stopSpeaking()
      setSpeaking(false)
    }
  }

  function launchTour() {
    stopSpeaking()
    setSpeaking(false)
    setTourOpen(true)
    setOpen(false)
  }

  function closePanel() {
    stopSpeaking()
    setSpeaking(false)
    setOpen(false)
  }

  // Persistir + autoscroll.
  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)))
    } catch {
      // storage lleno: ignorar
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, hydrated])

  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean || busy) return

      const myGeneration = ++generationRef.current
      const isStale = () => generationRef.current !== myGeneration

      const nextMessages: ChatMessage[] = [...messages, { role: "user", text: clean }]
      setMessages(nextMessages)
      setInput("")
      setBusy(true)

      // Placeholder del asistente que se va llenando con el stream. Su índice
      // en el array queda fijo: es el que se animará con el typewriter.
      const assistantIdx = nextMessages.length
      setMessages((prev) => [...prev, { role: "assistant", text: "", actions: [] }])

      const controller = new AbortController()
      abortRef.current = controller

      function patchLast(patch: (m: ChatMessage) => ChatMessage) {
        if (isStale()) return
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = patch(copy[copy.length - 1])
          return copy
        })
      }

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              text: m.text,
            })),
          }),
        })

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string; retryAfterSeconds?: number }
            | null
          const base = data?.error ?? "El asistente no está disponible ahora."
          const retry = data?.retryAfterSeconds ? ` (intenta de nuevo en ~${data.retryAfterSeconds}s)` : ""
          patchLast((m) => ({ ...m, text: base + retry }))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          if (isStale()) break
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let idx = buffer.indexOf("\n")
          while (idx !== -1) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            idx = buffer.indexOf("\n")
            if (!line) continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(line)
            } catch {
              continue
            }

            if (event.type === "tool") {
              const chip: ActionChip = {
                label: String(event.label ?? event.name ?? "Acción"),
                write: Boolean(event.write),
                status: (event.status as ActionChip["status"]) ?? "run",
              }
              patchLast((m) => {
                const actions = [...(m.actions ?? [])]
                // La actualización 'ok'/'error' reemplaza al 'run' de la misma acción.
                const runIdx = actions.findIndex((a) => a.label === chip.label && a.status === "run")
                if (chip.status !== "run" && runIdx !== -1) actions[runIdx] = chip
                else actions.push(chip)
                return { ...m, actions }
              })
            } else if (event.type === "client_action" && event.action === "start_tour") {
              // Manuel lanzó el tour guiado: cerrar el chat y arrancarlo.
              setTourOpen(true)
              setOpen(false)
            } else if (event.type === "reply") {
              const replyText = String(event.text ?? "")
              // Marcar ANTES de setear el texto: al montarse el mensaje ya
              // debe saber que le toca teclearse.
              freshReplyRef.current = assistantIdx
              patchLast((m) => ({ ...m, text: replyText }))
              // Leer la respuesta en voz alta si la voz está activada.
              if (voiceOnRef.current && replyText) {
                speakText(replyText, {
                  onStart: () => setSpeaking(true),
                  onEnd: () => setSpeaking(false),
                })
              }
            } else if (event.type === "error") {
              patchLast((m) => ({
                ...m,
                text: m.text || String(event.message ?? "Error del asistente."),
              }))
            }
          }
        }
      } catch {
        patchLast((m) => ({
          ...m,
          text: m.text || "Se cortó la conexión con el asistente. Prueba de nuevo.",
        }))
      } finally {
        // Si mientras tanto arrancó una conversación nueva (o esta se
        // canceló), esos `busy`/`abortRef` ya pertenecen a ESA generación —
        // tocarlos acá los pisaría de forma incorrecta.
        if (!isStale()) {
          setBusy(false)
          abortRef.current = null
        }
      }
    },
    [busy, messages]
  )

  // Ocultable por el operador desde el portal (fail-open mientras carga).
  if (!isVisible("admin", "asistente")) return null

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"

  return (
    <>
      {/* Tour guiado por los módulos (botón 🧭 o Manuel desde el chat) */}
      {tourOpen && (
        <TourOverlay
          onClose={() => setTourOpen(false)}
          isModuleVisible={isVisible}
          voiceEnabled={voiceOn}
        />
      )}

      {/* Botón flotante: la cara de Manuel con anillo de gradiente giratorio */}
      {!open && !tourOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir a Manuel, tu asistente"
          className="manuel-float group fixed right-5 bottom-5 z-40 rounded-full"
        >
          <span className="manuel-ring manuel-ring-spin absolute -inset-1.5 rounded-full opacity-50 blur-md transition group-hover:opacity-80" />
          <span className="manuel-ring manuel-ring-spin absolute -inset-[3px] rounded-full" />
          <span className="relative block rounded-full bg-white p-[3px]">
            <ManuelAvatar size={56} animated className="block" />
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end sm:p-4">
          <button
            type="button"
            aria-label="Cerrar asistente"
            onClick={closePanel}
            className="absolute inset-0 bg-black/20 sm:bg-transparent"
          />
          <aside className="manuel-panel-in relative z-10 flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_24px_80px_-16px_rgba(28,25,23,0.35)] ring-1 ring-stone-200/70 sm:w-[440px] sm:rounded-[28px]">
            {/* Hairline de gradiente superior (acento de marca) */}
            <div className="manuel-gradient-bg h-[3px] w-full shrink-0" />

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3">
              <ManuelAvatar
                size={38}
                animated
                talking={speaking}
                className="manuel-hello shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="manuel-gradient-text text-[15px] leading-tight font-extrabold tracking-tight">
                  Manuel
                </p>
                <p className="truncate text-[11px] text-stone-400">Tu asistente de MESA</p>
              </div>
              {speechAvailable() && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={voiceOn ? "Silenciar a Manuel" : "Activar la voz de Manuel"}
                  title={voiceOn ? "Voz activada" : "Voz desactivada"}
                  className={`${iconBtn} ${voiceOn ? "" : "opacity-40 grayscale"}`}
                >
                  {voiceOn ? <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" /> : <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />}
                </button>
              )}
              <button
                type="button"
                onClick={launchTour}
                title="Tour por la plataforma"
                aria-label="Tour por la plataforma"
                className={iconBtn}
              >
                <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    // Invalida cualquier send() en vuelo ANTES de abortar: su
                    // catch/finally ya no va a tocar el estado de esta
                    // conversación nueva (ver `isStale()` dentro de send()).
                    generationRef.current++
                    abortRef.current?.abort()
                    stopSpeaking()
                    setSpeaking(false)
                    freshReplyRef.current = null
                    setMessages([])
                    setBusy(false)
                  }}
                  title="Nueva conversación"
                  aria-label="Nueva conversación"
                  className={iconBtn}
                >
                  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={closePanel} aria-label="Cerrar" className={iconBtn}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col justify-center gap-6">
                  {/* Saludo estilo Gemini: texto grande con gradiente */}
                  <div>
                    <ManuelAvatar size={64} animated className="manuel-hello" />
                    <h2 className="manuel-gradient-text mt-4 text-[26px] leading-8 font-extrabold tracking-tight">
                      ¡Hola! Soy Manuel
                    </h2>
                    <p className="mt-1.5 max-w-[300px] text-[13px] leading-5 text-stone-500">
                      Puedo crear cosas en tu carta, analizar tus ventas e inventario, y
                      explicarte cómo usar MESA.
                    </p>
                  </div>

                  {/* Banner del tour con gradiente */}
                  <button
                    type="button"
                    onClick={launchTour}
                    className="manuel-gradient-bg group relative overflow-hidden rounded-2xl p-4 text-left shadow-lg shadow-orange-500/25 transition hover:shadow-orange-500/40"
                  >
                    <p className="flex items-center gap-1.5 text-[14px] font-extrabold text-white">
                      <Compass className="h-4 w-4" aria-hidden="true" />
                      Conocer la plataforma
                    </p>
                    <p className="mt-0.5 text-[12px] leading-4 text-orange-100">
                      Te llevo módulo por módulo en un tour guiado.
                    </p>
                    <span className="absolute top-1/2 right-4 -translate-y-1/2 text-white/80 transition group-hover:translate-x-1">
                      →
                    </span>
                  </button>

                  {/* Sugerencias en grilla (tarjetas estilo Gemini) */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => send(s.text)}
                        className="flex flex-col gap-2 rounded-2xl bg-[#F6F4F0] p-3.5 text-left transition hover:bg-orange-50 hover:shadow-md hover:shadow-orange-500/10"
                      >
                        <s.icon className="h-[18px] w-[18px] text-orange-600" aria-hidden="true" />
                        <span className="text-[12px] leading-4 font-medium text-stone-600">
                          {s.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) =>
                  m.role === "user" ? (
                    // Usuario: burbuja suave alineada a la derecha (estilo Gemini)
                    <div key={i} className="manuel-msg-in flex justify-end">
                      <div className="max-w-[85%] rounded-[20px] rounded-br-md bg-[#F4F1EC] px-4 py-2.5 text-[13.5px] leading-5 text-stone-800">
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  ) : (
                    // Manuel: SIN burbuja — avatar al margen + contenido a lo ancho
                    <div key={i} className="manuel-msg-in flex gap-3">
                      <ManuelAvatar size={28} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
                        {/* Log de acciones ejecutadas */}
                        {m.actions && m.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {m.actions.map((a, j) => (
                              <span
                                key={j}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                                  a.status === "run"
                                    ? "bg-[#F6F4F0] text-stone-500"
                                    : a.status === "error"
                                      ? "bg-red-50 text-red-600"
                                      : a.write
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-[#F6F4F0] text-stone-500"
                                }`}
                              >
                                {a.status === "run" ? (
                                  <span className="manuel-ring manuel-ring-spin inline-block h-2.5 w-2.5 rounded-full" />
                                ) : a.status === "error" ? (
                                  "✗"
                                ) : (
                                  "✓"
                                )}
                                {a.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.text ? (
                          <div className="text-[13.5px] leading-6 text-stone-800">
                            <TypewriterMarkdown
                              text={m.text}
                              animate={i === freshReplyRef.current}
                              onProgress={() => {
                                const el = scrollRef.current
                                if (el) el.scrollTop = el.scrollHeight
                              }}
                              onDone={() => {
                                if (freshReplyRef.current === i) freshReplyRef.current = null
                              }}
                            />
                          </div>
                        ) : busy && i === messages.length - 1 ? (
                          // Pensando: shimmer tipo Gemini
                          <div className="space-y-2 pt-1">
                            <div className="manuel-shimmer h-3 w-[92%] rounded-full" />
                            <div className="manuel-shimmer h-3 w-[70%] rounded-full" />
                            <div className="manuel-shimmer h-3 w-[52%] rounded-full" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            {/* Input tipo píldora (estilo Gemini) */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="px-4 pt-1 pb-4"
            >
              <div className="flex items-end gap-1.5 rounded-[26px] border border-transparent bg-[#F4F1EC] py-1.5 pr-1.5 pl-4 transition focus-within:border-orange-200 focus-within:bg-white focus-within:shadow-lg focus-within:shadow-orange-500/10">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send(input)
                    }
                  }}
                  rows={1}
                  placeholder={busy ? "Manuel está trabajando…" : "Pídele algo a Manuel…"}
                  disabled={busy}
                  className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[13.5px] text-stone-900 outline-none placeholder:text-stone-400 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  aria-label="Enviar"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                    busy || !input.trim()
                      ? "bg-stone-200 text-stone-400"
                      : "manuel-gradient-bg text-white shadow-md shadow-orange-500/30 hover:shadow-orange-500/50"
                  }`}
                >
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
                  </svg>
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
