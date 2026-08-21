"use client"

import { useState } from "react"
import type { RefObject } from "react"

type ProductImageProps = {
  src: string | null
  alt: string
  className?: string
  imgRef?: RefObject<HTMLImageElement | null>
  /**
   * true = la imagen tiene fondo (foto) → blur + cover + degradado.
   * false = recorte transparente → contain limpio, sin efecto.
   * El dato viene de la BD (products.image_recortada), no se detecta.
   */
  hasBackground: boolean
  /** Dirección del degradado de fundido (solo para imágenes con fondo). */
  fade?: "right" | "bottom"
}

function normalizeImageSrc(src: string | null) {
  const trimmed = src?.trim()
  if (!trimmed) return null

  try {
    return encodeURI(trimmed)
  } catch {
    return trimmed
  }
}

function ImageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#141416] text-zinc-600">
      <svg className="h-6 w-6 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
      </svg>
    </div>
  )
}

/**
 * Imagen de producto con tratamiento adaptativo según la marca de la BD:
 * - CON fondo: backdrop borroso + imagen completa + degradado de fundido.
 * - SIN fondo (recorte): contain, sin blur ni degradado.
 * Marca la <img> con data-cutout para que flyToCart decida si vuela en círculo.
 */
export function ProductImage({ src, alt, className = "", imgRef, hasBackground, fade }: ProductImageProps) {
  const dataCutout = hasBackground ? undefined : "true"
  const imageSrc = normalizeImageSrc(src)
  const [imageState, setImageState] = useState<{ src: string | null; status: "idle" | "loaded" | "failed" }>({
    src: null,
    status: "idle",
  })
  const currentStatus = imageState.src === imageSrc ? imageState.status : "idle"
  const isLoaded = currentStatus === "loaded"
  const hasFailed = currentStatus === "failed"

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {imageSrc && !hasFailed ? (
        hasBackground ? (
          <>
            {!isLoaded ? <ImageFallback /> : null}
            {isLoaded ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center blur-2xl brightness-[0.55]"
                style={{ backgroundImage: `url("${imageSrc}")` }}
              />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt={alt}
              loading="lazy"
              onLoad={() => setImageState({ src: imageSrc, status: "loaded" })}
              onError={() => setImageState({ src: imageSrc, status: "failed" })}
              data-cutout={dataCutout}
              className={`absolute inset-0 z-[1] h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.04] ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
            {isLoaded && fade === "right" ? (
              <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(90deg,transparent_45%,#161618_100%)]" />
            ) : null}
            {isLoaded && fade === "bottom" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-28 bg-gradient-to-t from-[#0f0f10] to-transparent" />
            ) : null}
          </>
        ) : (
          <>
            {!isLoaded ? <ImageFallback /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt={alt}
              loading="lazy"
              onLoad={() => setImageState({ src: imageSrc, status: "loaded" })}
              onError={() => setImageState({ src: imageSrc, status: "failed" })}
              data-cutout={dataCutout}
              className={`absolute inset-0 z-[1] h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.04] ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        )
      ) : (
        <ImageFallback />
      )}
    </div>
  )
}
