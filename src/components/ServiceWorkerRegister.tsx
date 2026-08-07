"use client"

import { useEffect } from "react"
import { useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

export function ServiceWorkerRegister() {
  const router = useRouter()
  const pathname = usePathname()
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    const isProd = process.env.NODE_ENV === "production"

    // La PWA del MESERO usa sw.js (offline con caché). La PWA del ADMIN usa
    // admin-sw.js (sin caché: solo habilita la instalación). El menú del
    // cliente (QR) y la landing NO deben quedar bajo ningún SW: el cliente en
    // móvil no puede hard-reload, así que jamás debe quedar atrapado con assets
    // cacheados. En dev tampoco se registra nada.
    if (isProd && pathname.startsWith("/waiter")) {
      // Sin scope explícito, el scope por defecto de un SW en "/sw.js" es "/"
      // (la raíz) — es decir, sin esto, este mismo SW quedaba habilitado para
      // interceptar CUALQUIER navegación del sitio, landing incluida, pese a
      // que el comentario de arriba dice exactamente lo contrario. Con
      // networkFirst rara vez se notaba (casi siempre hay red), pero ante
      // cualquier falla de red le tocaba de vuelta el shell cacheado de "/"
      // en vez de contenido fresco.
      navigator.serviceWorker.register("/sw.js", { scope: "/waiter" }).catch(() => undefined)
      return
    }

    if (isProd && pathname.startsWith("/admin")) {
      // admin-sw.js no cachea navegaciones (siempre red) → el admin nunca queda
      // con contenido viejo; solo existe para que "Instalar app" funcione.
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin" })
        .catch(() => undefined)
      return
    }

    // Landing / menú del comensal (o dev): desregistrar cualquier SW y limpiar
    // sus cachés, para servir siempre contenido fresco.
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => undefined)

    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k.startsWith("mesa-offline-")).map((k) => caches.delete(k))
          )
        )
        .catch(() => undefined)
    }
  }, [pathname])

  useEffect(() => {
    function handleOffline() {
      wasOfflineRef.current = true
    }

    function refreshAfterReconnect() {
      if (!wasOfflineRef.current || !navigator.onLine) return

      wasOfflineRef.current = false
      router.refresh()
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshAfterReconnect()
      }
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", refreshAfterReconnect)
    window.addEventListener("focus", refreshAfterReconnect)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", refreshAfterReconnect)
      window.removeEventListener("focus", refreshAfterReconnect)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [router])

  return null
}
