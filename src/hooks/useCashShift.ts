"use client"

import { useCallback, useEffect, useState } from "react"
import { getCurrentShift, type CurrentShift } from "@/services/cash-shift-service"

export function useCashShift() {
  const [shift, setShift] = useState<CurrentShift | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCurrentShift()
      setShift(res.ok ? res.data : null)
    } catch {
      setShift(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Refresco silencioso (sin flash de "Cargando"): lo que se cobra durante el
  // turno debe reflejarse sin que el admin tenga que recargar la página.
  const refreshSilently = useCallback(async () => {
    try {
      const res = await getCurrentShift()
      if (res.ok) setShift(res.data)
    } catch {
      // se mantiene el último valor conocido
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void reload()
    }, 0)
    return () => window.clearTimeout(id)
  }, [reload])

  useEffect(() => {
    const interval = window.setInterval(refreshSilently, 30_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSilently()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshSilently])

  return { shift, loading, reload }
}
