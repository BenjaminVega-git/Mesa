import { useCallback, useEffect, useRef, useState } from "react"

function getErrorText(err: unknown) {
  if (err instanceof Error) return `${err.name} ${err.message}`.toLowerCase()
  if (typeof err === "string") return err.toLowerCase()
  if (typeof err !== "object" || err === null) return ""

  return ["name", "message", "code", "status"]
    .map((key) => {
      const value = err[key as keyof typeof err]
      return typeof value === "string" || typeof value === "number" ? String(value) : ""
    })
    .join(" ")
    .toLowerCase()
}

export function isNetworkError(err: unknown) {
  const errorText = getErrorText(err)

  return Boolean(
    errorText &&
      (errorText.includes("fetch") ||
        errorText.includes("network") ||
        errorText.includes("failed to fetch") ||
        errorText.includes("load failed") ||
        errorText.includes("internet disconnected") ||
        errorText.includes("err_internet_disconnected") ||
        errorText.includes("authretryablefetcherror"))
  )
}

export function useOfflineRetry<T = void>(fn: () => Promise<T>) {
  const [isPending, setIsPending] = useState(false)
  const fnRef = useRef(fn)
  const isRetryingRef = useRef(false)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!isPending) return

    async function retry() {
      if (isRetryingRef.current) return
      isRetryingRef.current = true

      try {
        await fnRef.current()
        setIsPending(false)
      } catch (err) {
        if (!isNetworkError(err)) setIsPending(false)
      } finally {
        isRetryingRef.current = false
      }
    }

    const intervalId = window.setInterval(retry, 3000)
    window.addEventListener("online", retry)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("online", retry)
    }
  }, [isPending])

  const run = useCallback(async (): Promise<T> => {
    try {
      return await fnRef.current()
    } catch (err) {
      if (isNetworkError(err)) setIsPending(true)
      throw err
    }
  }, [])

  return { run, isPending }
}
