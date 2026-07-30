"use client"

import { useEffect, useRef, useState } from "react"
import { MarkdownLite } from "@/components/admin/assistant/MarkdownLite"

/**
 * Efecto máquina de escribir para las respuestas de Manuel en el chat: el
 * markdown se revela carácter a carácter con el cursor de terminal al final
 * (mismo efecto del tour), mientras la voz narra. Velocidad adaptativa: las
 * respuestas largas teclean más rápido para no hacer esperar. Clic sobre el
 * texto = mostrarlo completo. Con prefers-reduced-motion aparece completo.
 *
 * Se monta cuando la respuesta ya llegó completa (el stream muestra shimmer
 * antes), así que el texto es estable durante toda la animación. `animate`
 * en false (historial restaurado, mensajes viejos) lo renderiza directo.
 */
export function TypewriterMarkdown({
  text,
  animate,
  onProgress,
  onDone,
}: {
  text: string
  animate: boolean
  /** Se llama en cada avance del tecleo (para acompañar con el scroll). */
  onProgress?: () => void
  /** Se llama una vez al terminar de teclear (o de inmediato si no anima). */
  onDone?: () => void
}) {
  const [shown, setShown] = useState(() => {
    if (!animate) return text.length
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return text.length
    }
    return 0
  })
  const doneNotified = useRef(false)

  const done = shown >= text.length

  useEffect(() => {
    if (done) {
      if (!doneNotified.current) {
        doneNotified.current = true
        onDone?.()
      }
      return
    }
    // El texto ya llegó completo del servidor — esto es puro efecto visual,
    // no hay que esperar nada real. Antes, con un paso fijo de hasta 4
    // caracteres/tick a 14ms, una respuesta de 2000 caracteres (dentro de
    // maxOutputTokens) tardaba ~7s en verse completa aunque ya estuviera
    // lista. Con el paso escalado al largo del texto, la animación entera
    // dura ~1.1s sin importar cuán larga sea la respuesta.
    const TARGET_TICKS = 80
    const step = Math.max(1, Math.ceil(text.length / TARGET_TICKS))
    const id = setInterval(() => {
      setShown((prev) => {
        if (prev >= text.length) {
          clearInterval(id)
          return prev
        }
        return Math.min(text.length, prev + step)
      })
      onProgress?.()
    }, 14)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- corre una vez por montaje; el texto llega completo antes de montar
  }, [done])

  if (done) return <MarkdownLite text={text} />

  return (
    <span onClick={() => setShown(text.length)} className="block cursor-pointer">
      <MarkdownLite text={text.slice(0, shown)} caret />
    </span>
  )
}
