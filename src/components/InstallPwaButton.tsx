"use client"

import { useEffect, useState } from "react"
import { Smartphone } from "lucide-react"

// Tipo del evento beforeinstallprompt (no está en el lib.dom estándar).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

// Botón que aparece solo si el navegador soporta instalación de PWA y la
// app no está ya instalada. En iOS Safari no se dispara beforeinstallprompt:
// los usuarios deben usar "Compartir → Agregar a inicio" manualmente.
export function InstallPwaButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed || !prompt) return null

  return (
    <button
      type="button"
      onClick={async () => {
        await prompt.prompt()
        const choice = await prompt.userChoice
        if (choice.outcome === "accepted") setInstalled(true)
        setPrompt(null)
      }}
      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2.5 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-50"
    >
      <Smartphone className="h-4 w-4" aria-hidden="true" />
      Instalar app en mi teléfono
    </button>
  )
}
