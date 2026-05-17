import { useCallback, useEffect, useRef, useState } from "react"

function isNetworkError(err: unknown) {
  return (
    err instanceof TypeError &&
    (err.message.toLowerCase().includes("fetch") ||
      err.message.toLowerCase().includes("network"))
  )
}

export function useOfflineRetry<T = void>(fn: () => Promise<T>) {
  const [isPending, setIsPending] = useState(false)
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!isPending) return

    async function handleOnline() {
      try {
        await fnRef.current()
        setIsPending(false)
      } catch (err) {
        if (!isNetworkError(err)) setIsPending(false)
      }
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
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
