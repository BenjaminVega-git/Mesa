import { useCallback, useEffect, useState } from "react"
import { isNetworkError, useOfflineRetry } from "./useOfflineRetry"

type CacheOptions = {
  ttl?: number
  enabled?: boolean
  revalidateOnMount?: boolean
  revalidateOnFocus?: boolean
  initialDelay?: number
  factor?: number
  maxDelay?: number
}

type CacheState<T> = {
  data: T | null
  isFromCache: boolean
  isLoading: boolean
  isPendingRetry: boolean
  error: unknown
  refresh: () => void
  cancel: () => void
}

function readCache<T>(key: string, ttl?: number): T | null {
  try {
    if (typeof window === "undefined") return null

    const raw = localStorage.getItem(key)
    if (!raw) return null

    const { data, ts } = JSON.parse(raw) as { data: T; ts: number }
    if (ttl !== undefined && Date.now() - ts > ttl) return null

    return data
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    if (typeof window === "undefined") return

    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // localStorage can be full or blocked; cached reads are best-effort.
  }
}

const cacheSubscribers = new Map<string, Set<() => void>>()

function subscribeCache(key: string, fn: () => void): () => void {
  let bucket = cacheSubscribers.get(key)
  if (!bucket) {
    bucket = new Set()
    cacheSubscribers.set(key, bucket)
  }
  bucket.add(fn)
  return () => {
    bucket?.delete(fn)
    if (bucket && bucket.size === 0) cacheSubscribers.delete(key)
  }
}

function notifyCache(key: string): void {
  cacheSubscribers.get(key)?.forEach((fn) => fn())
}

export function invalidateCache(keyOrPrefix: string): void {
  try {
    if (typeof window === "undefined") return

    if (keyOrPrefix.endsWith(":*")) {
      const prefix = keyOrPrefix.slice(0, -2)
      const keys = Object.keys(localStorage)
      keys.forEach((k) => {
        if (k.startsWith(prefix)) {
          localStorage.removeItem(k)
        }
      })
      cacheSubscribers.forEach((bucket, key) => {
        if (key.startsWith(prefix)) bucket.forEach((fn) => fn())
      })
      return
    }

    localStorage.removeItem(keyOrPrefix)
    notifyCache(keyOrPrefix)
  } catch {
  }
}


export function useCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  {
    ttl,
    enabled = true,
    revalidateOnMount = false,
    revalidateOnFocus = false,
    initialDelay,
    factor,
    maxDelay,
  }: CacheOptions = {}
): CacheState<T> {
  const [data, setData] = useState<T | null>(null)
  const [isFromCache, setIsFromCache] = useState(false)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(null)

  const fetcherForRetry = useCallback(async (): Promise<T> => {
    const result = await fetcher()

    writeCache(key, result)
    setData(result)
    setIsFromCache(false)
    setIsLoading(false)
    setError(null)

    return result
  }, [key, fetcher])

  const { run, isPending: isPendingRetry, cancel } = useOfflineRetry(fetcherForRetry, {
    initialDelay,
    factor,
    maxDelay,
  })

  useEffect(() => {
    if (!enabled) {
      cancel()
      queueMicrotask(() => {
        setData(null)
        setIsFromCache(false)
        setIsLoading(false)
        setError(null)
      })
      return
    }

    const cached = readCache<T>(key, ttl)

    if (cached !== null) {
      queueMicrotask(() => {
        setData(cached)
        setIsFromCache(true)
        setIsLoading(false)
        setError(null)
      })

      if (revalidateOnMount) {
        run().catch((err) => {
          if (!isNetworkError(err)) setError(err)
        })
      }

      return
    }

    queueMicrotask(() => {
      setData(null)
      setIsFromCache(false)
      setIsLoading(true)
      setError(null)
    })

    run().catch((err) => {
      if (!isNetworkError(err)) {
        setError(err)
        setIsLoading(false)
      }
    })
  }, [cancel, enabled, key, revalidateOnMount, run, ttl])

  useEffect(() => {
    if (!enabled) return

    function refreshFromCache() {
      if (!isFromCache && !revalidateOnFocus) return

      fetcher()
        .then((fresh) => {
          writeCache(key, fresh)
          setData(fresh)
          setIsFromCache(false)
          setError(null)
        })
        .catch(() => {
        })
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshFromCache()
      }
    }

    window.addEventListener("online", refreshFromCache)
    window.addEventListener("focus", refreshFromCache)
    document.addEventListener("visibilitychange", refreshWhenVisible)

    const unsubscribe = subscribeCache(key, () => {
      fetcher()
        .then((fresh) => {
          writeCache(key, fresh)
          setData(fresh)
          setIsFromCache(false)
          setError(null)
        })
        .catch(() => {})
    })

    return () => {
      window.removeEventListener("online", refreshFromCache)
      window.removeEventListener("focus", refreshFromCache)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
      unsubscribe()
    }
  }, [enabled, key, fetcher, isFromCache, revalidateOnFocus])

  const refresh = useCallback(() => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    run().catch((err) => {
      if (!isNetworkError(err)) {
        setError(err)
        setIsLoading(false)
      }
    })
  }, [enabled, run])

  return {
    data,
    isFromCache,
    isLoading,
    isPendingRetry,
    error,
    refresh,
    cancel,
  }
}
