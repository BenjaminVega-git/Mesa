// ============================================================================
// Validación SSRF-safe para URLs de imágenes externas.
//
// Protege el flujo de importación de menús: el servidor (Railway) descarga
// imágenes desde URLs que en última instancia provienen de Pexels, pero que
// pasan por JSON de Gemini y por el preview editable del admin. Sin validar,
// un image_url malicioso podría apuntar a localhost, IPs internas o al
// endpoint de metadata del cloud (169.254.169.254) y filtrar la respuesta.
//
// Defensa en dos capas:
//   1. Whitelist de hosts HTTPS conocidos  -> corta el caso común.
//   2. Resolución DNS + rechazo de IPs privadas/loopback/link-local
//      -> defensa en profundidad contra DNS rebinding / hosts comprometidos.
//
// El fetch que use estas URLs debe además: redirect "manual", timeout y
// límite de bytes (ver fetchImageSafely más abajo).
// ============================================================================

import { lookup } from "node:dns/promises"
import net from "node:net"

// Hosts exactos permitidos. Pexels sirve las fotos desde images.pexels.com.
// Si en el futuro agregas otra fuente de stock o tu propio CDN, súmalo aquí.
const ALLOWED_IMAGE_HOSTS = new Set<string>([
  "images.pexels.com",
  "res.cloudinary.com",
])

// Rangos de IP que NUNCA se deben contactar desde el servidor.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true // ante la duda, bloquear
  const [a, b] = parts
  return (
    a === 10 ||                                // 10.0.0.0/8
    a === 127 ||                               // 127.0.0.0/8 loopback
    (a === 172 && b >= 16 && b <= 31) ||       // 172.16.0.0/12
    (a === 192 && b === 168) ||                // 192.168.0.0/16
    (a === 169 && b === 254) ||                // 169.254.0.0/16 link-local (metadata cloud)
    a === 0 ||                                 // 0.0.0.0/8
    a >= 224                                   // multicast / reservado
  )
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  return (
    lower === "::1" ||                         // loopback
    lower.startsWith("fc") ||                  // fc00::/7 unique-local
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||                // link-local
    lower.startsWith("::ffff:")                // IPv4 mapeado -> validar aparte
  )
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) {
    // IPv4 mapeado en IPv6 (::ffff:127.0.0.1)
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    return isPrivateIPv6(ip)
  }
  return true // formato desconocido -> bloquear
}

/**
 * Lanza si la URL no es segura para que el servidor la descargue.
 * Valida: protocolo HTTPS, host en whitelist, y que el host resuelva a una
 * IP pública (no privada/loopback/link-local).
 */
export async function assertSafeImageUrl(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("URL de imagen inválida")
  }

  if (url.protocol !== "https:") {
    throw new Error("Solo se permiten URLs https")
  }

  const host = url.hostname.toLowerCase()

  if (!ALLOWED_IMAGE_HOSTS.has(host)) {
    throw new Error(`Host de imagen no permitido: ${host}`)
  }

  // Resolver DNS y verificar que ninguna IP devuelta sea privada.
  // (defensa contra un host en whitelist que resuelva a IP interna)
  let resolved: { address: string }[]
  try {
    resolved = await lookup(host, { all: true })
  } catch {
    throw new Error("No se pudo resolver el host de la imagen")
  }

  if (resolved.length === 0) {
    throw new Error("El host de la imagen no resolvió a ninguna IP")
  }

  for (const { address } of resolved) {
    if (isPrivateAddress(address)) {
      throw new Error("El host de la imagen apunta a una dirección no permitida")
    }
  }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
const FETCH_TIMEOUT_MS = 10_000          // 10 s

/**
 * Descarga una imagen de forma segura: valida la URL (SSRF), prohíbe redirects,
 * aplica timeout y limita el tamaño leyendo el stream (no confía en
 * Content-Length, que puede mentir).
 * Devuelve el Blob, o lanza si algo no es seguro.
 */
export async function fetchImageSafely(rawUrl: string): Promise<Blob> {
  await assertSafeImageUrl(rawUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(rawUrl, {
      cache: "no-store",
      redirect: "manual", // un redirect a localhost evadiría la validación de URL
      signal: controller.signal,
    })

    if (res.status >= 300 && res.status < 400) {
      throw new Error("Redirect no permitido al descargar la imagen")
    }
    if (!res.ok) {
      throw new Error(`Descarga de imagen falló (${res.status})`)
    }

    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      throw new Error("El recurso descargado no es una imagen")
    }

    // Leer con límite de bytes.
    if (!res.body) throw new Error("Respuesta de imagen sin cuerpo")
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel()
          throw new Error("La imagen excede el tamaño máximo permitido")
        }
        chunks.push(value)
      }
    }

    return new Blob(chunks as BlobPart[], { type: contentType })
  } finally {
    clearTimeout(timeout)
  }
}
