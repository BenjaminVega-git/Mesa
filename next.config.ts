import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const localSupabaseConnect = process.env.MESA_LOCAL_SUPABASE === "1"
  ? buildLocalSupabaseConnect()
  : ""

function buildLocalSupabaseConnect() {
  const origins = new Set([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "ws://localhost:54321",
    "ws://127.0.0.1:54321",
  ])

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl)
      origins.add(url.origin)
      if (url.protocol === "http:") origins.add(`ws://${url.host}`)
      if (url.protocol === "https:") origins.add(`wss://${url.host}`)
    } catch {
      // Invalid env values are handled by the Supabase client at runtime.
    }
  }

  return ` ${Array.from(origins).join(" ")}`
}

// CSP conservadora: permite los orígenes que el cliente realmente usa
// (Supabase REST/realtime, Cloudinary) y mantiene 'unsafe-inline'/'unsafe-eval'
// en scripts para no romper la hidratación de Next ni librerías; el control
// clave anti-exfiltración es connect-src acotado + frame-ancestors 'none'.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com${localSupabaseConnect}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ")

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
]

const nextConfig: NextConfig = {
  // Orígenes permitidos para desarrollo (evita errores de CORS en la red local)
  allowedDevOrigins: [
    "192.168.18.74",  // Laptop de Tomy
    "10.142.155.101",   // Laptop de Benja
    "192.168.56.1",   // Laptop de Amaro
    "127.0.0.1",  // VPS
  ],
  // Las Server Actions cargan imágenes (importar carta con Gemini, hasta 6 fotos en base64).
  // Default es 1MB, lo subimos para que no rechace silenciosamente.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
  async rewrites() {
    if (process.env.MESA_LOCAL_SUPABASE !== "1") return []

    return [
      {
        source: "/supabase/:path*",
        destination: "http://127.0.0.1:54321/:path*",
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  org: "107-1x",
  project: "mesa",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
