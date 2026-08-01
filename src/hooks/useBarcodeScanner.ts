import { useEffect, useRef } from "react"

type UseBarcodeScannerOptions = {
  enabled?: boolean
  minLength?: number
  maxGapMs?: number
  onScan: (code: string) => void
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable
}

export function useBarcodeScanner({
  enabled = true,
  minLength = 3,
  maxGapMs = 70,
  onScan,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef("")
  const lastKeyAtRef = useRef(0)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    function resetBuffer() {
      bufferRef.current = ""
      lastKeyAtRef.current = 0
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || isEditableTarget(event.target)) {
        resetBuffer()
        return
      }

      const now = Date.now()
      if (lastKeyAtRef.current && now - lastKeyAtRef.current > maxGapMs) {
        bufferRef.current = ""
      }
      lastKeyAtRef.current = now

      if (event.key === "Enter") {
        const code = bufferRef.current.trim()
        resetBuffer()
        if (code.length >= minLength) {
          event.preventDefault()
          onScanRef.current(code)
        }
        return
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [enabled, maxGapMs, minLength])
}
