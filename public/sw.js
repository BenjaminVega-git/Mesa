const CACHE_VERSION = "mesa-offline-v42"
const PAGE_CACHE = `${CACHE_VERSION}-pages`
const ASSET_CACHE = `${CACHE_VERSION}-assets`
const IMAGE_CACHE = `${CACHE_VERSION}-images`
// Shell de la PWA del mesero: preload en install para que abra al instante,
// incluso offline. Si agregás más rutas críticas del mesero, sumalas acá.
// "/" (la landing) NO va acá: el registro ahora usa scope:"/waiter", así que
// este SW nunca vuelve a recibir fetch de la home — cachearla quedaba muerto.
const APP_SHELL_URLS = ["/waiter/login", "/waiter/control", "/waiter/busy"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mesa-offline-") && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

async function cacheResponse(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== "opaque")) return response

  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())

  return response
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName)

  try {
    const response = await fetch(request)
    await cacheResponse(cacheName, request, response)
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached

    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl)
      if (fallback) return fallback
    }

    throw new Error("No cached response available")
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  await cacheResponse(cacheName, request, response)

  return response
}

// Como las fotos de producto son cross-origin (Cloudinary → respuesta
// opaca, sin status legible), cacheFirst puede quedar pegado a una imagen
// vieja/rota para siempre dentro de una misma CACHE_VERSION. stale-while-
// revalidate sirve la copia cacheada al instante (si existe) pero SIEMPRE
// dispara un refetch en segundo plano que actualiza la caché — así una
// imagen mala se autocorrige en la próxima carga sin esperar un deploy.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const refresh = fetch(request)
    .then((response) => cacheResponse(cacheName, request, response))
    .catch(() => undefined)

  if (cached) {
    void refresh
    return cached
  }

  return (await refresh) || Response.error()
}

self.addEventListener("fetch", (event) => {
  const { request } = event

  if (request.method !== "GET") return

  const url = new URL(request.url)
  const isSameOrigin = url.origin === self.location.origin

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE, "/"))
    return
  }

  if (isSameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE))
    return
  }

  if (isSameOrigin) {
    event.respondWith(networkFirst(request, ASSET_CACHE))
  }
})
