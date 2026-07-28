"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ManuelAvatar } from "@/components/admin/assistant/ManuelAvatar"
import { buildTourSteps } from "@/lib/assistant/tour-steps"
import { useRestaurant } from "@/hooks/useRestaurant"
import { useMyPlan } from "@/hooks/useMyPlan"
import { speakText, stopSpeaking } from "@/lib/assistant/voice"

/**
 * Efecto máquina de escribir: el texto del paso aparece carácter a carácter
 * con un cursor de terminal parpadeando, mientras Manuel lo narra. Se monta
 * con key por paso (el estado arranca de cero en cada uno, sin setState en
 * cuerpo de efecto). Clic sobre el texto = mostrarlo completo al instante.
 * Con prefers-reduced-motion el texto aparece completo de una.
 */
function TypeText({ text }: { text: string }) {
  const [shown, setShown] = useState(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return text.length
    }
    return 0
  })

  useEffect(() => {
    if (shown >= text.length) return
    const id = setInterval(() => {
      setShown((prev) => {
        if (prev >= text.length) {
          clearInterval(id)
          return prev
        }
        return prev + 1
      })
    }, 16)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arranca una vez por montaje (key por paso)
  }, [])

  const done = shown >= text.length
  return (
    <span onClick={() => setShown(text.length)} className={done ? undefined : "cursor-pointer"}>
      {text.slice(0, shown)}
      {!done && <span className="manuel-caret" aria-hidden />}
    </span>
  )
}

/**
 * TOUR GUIADO de Manuel: recorre los módulos del panel navegando a cada ruta
 * y mostrando una tarjeta con la explicación. Motor determinístico (los pasos
 * viven en tour-steps.ts), lanzado desde el chat vía la herramienta
 * `iniciar_tour`. Vive junto al AssistantWidget en el layout de /admin, así
 * que sobrevive a la navegación entre rutas.
 */
export function TourOverlay({
  onClose,
  isModuleVisible,
  voiceEnabled = false,
}: {
  onClose: () => void
  isModuleVisible: (area: "admin", key: string) => boolean
  /** true = Manuel narra cada paso en voz alta (TTS del navegador). */
  voiceEnabled?: boolean
}) {
  const router = useRouter()
  // El overlay se monta SOLO mientras el tour está activo (el padre lo
  // renderiza condicionalmente), así que el índice arranca en 0 cada vez.
  const [idx, setIdx] = useState(0)
  const [talking, setTalking] = useState(false)

  // Mismo contexto que usa el sidebar para decidir qué ítems mostrar: los
  // pasos se derivan del orden del sidebar (arriba → abajo) cruzado con los
  // módulos visibles + la config del restaurante + el plan.
  const { restaurant } = useRestaurant()
  const { plan } = useMyPlan()

  const steps = useMemo(
    () =>
      buildTourSteps({
        isModuleVisible: (key) => isModuleVisible("admin", key),
        restaurant,
        plan,
      }),
    [isModuleVisible, restaurant, plan]
  )

  // Clamp por si los pasos se recalculan a mitad del tour (visibilidad/plan
  // cargando): nunca quedar apuntando fuera del arreglo.
  const step = steps[Math.min(idx, steps.length - 1)]

  // Navegar a la ruta del paso actual.
  useEffect(() => {
    if (step?.route) router.push(step.route)
  }, [step, router])

  // Narrar el paso si la voz está activada (y callar al salir del tour).
  useEffect(() => {
    if (!voiceEnabled || !step) return
    speakText(`${step.title}. ${step.text}`, {
      onStart: () => setTalking(true),
      onEnd: () => setTalking(false),
    })
    return () => {
      stopSpeaking()
      setTalking(false)
    }
  }, [voiceEnabled, step])

  // Salir con Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!step) return null

  const isLast = idx === steps.length - 1

  return (
    <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
      <div className="manuel-panel-in w-full max-w-lg overflow-hidden rounded-[28px] bg-white/95 shadow-[0_24px_80px_-16px_rgba(28,25,23,0.4)] ring-1 ring-stone-200/70 backdrop-blur-xl">
        {/* Hairline de gradiente superior (acento de marca) */}
        <div className="manuel-gradient-bg h-[3px] w-full" />

        <div className="p-5">
          <div className="flex items-start gap-3.5">
            <span className="relative shrink-0">
              <span className="manuel-ring absolute -inset-[2.5px] rounded-full opacity-70" />
              <span className="relative block rounded-full bg-white p-[2.5px]">
                <ManuelAvatar size={46} animated talking={talking} className="block" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <span className="manuel-gradient-text text-[10px] font-extrabold tracking-[0.14em] uppercase">
                Paso {idx + 1} de {steps.length} · Tour de Manuel
              </span>
              <h3 className="mt-0.5 flex items-center gap-1.5 text-[16.5px] font-extrabold tracking-tight text-stone-900">
                <step.icon className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
                {step.title}
              </h3>
              {/* min-h evita que la tarjeta "salte" mientras el texto se escribe */}
              <p className="mt-1 min-h-[60px] text-[13px] leading-5 text-stone-600">
                <TypeText key={`${idx}-${step.title}`} text={step.text} />
              </p>
            </div>
          </div>

          {/* Progreso con gradiente */}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="manuel-gradient-bg h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((idx + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-2 text-[12px] font-semibold text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
            >
              Salir del tour
            </button>
            <div className="flex gap-2">
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  className="rounded-full px-4 py-2.5 text-[12px] font-bold text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 hover:ring-stone-300"
                >
                  Anterior
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? onClose() : setIdx((i) => i + 1))}
                className="manuel-gradient-bg rounded-full px-6 py-2.5 text-[12px] font-extrabold text-white shadow-lg shadow-orange-500/30 transition hover:shadow-orange-500/50"
              >
                {isLast ? "Terminar" : "Siguiente →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
