import { NextRequest, NextResponse } from "next/server"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { checkRemoveBgLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { fetchImageSafely } from "@/lib/security/safe-image-url"

export async function POST(request: NextRequest) {
  // 1. Exigir ADMIN (no solo sesión). Un mesero no debe gastar tu cuota
  //    de remove.bg. requireCurrentAdmin valida sesión + role_id=2 +
  //    que tenga restaurante, y nos devuelve restaurantId y userId.
  const guard = await requireCurrentAdmin()
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 })
  }
  const { userId } = guard.data

  // 2. Rate limit por usuario (protege tu cuota/costos de remove.bg).
  try {
    const { success } = await checkRemoveBgLimit(userId)
    if (!success) {
      return NextResponse.json(
        { error: "Demasiadas imágenes seguidas. Espera un momento e intenta de nuevo." },
        { status: 429 }
      )
    }
  } catch (err) {
    // Fail closed aquí: si el rate limit no responde, NO procesamos, porque
    // este endpoint cuesta dinero real. Mejor rechazar que arriesgar la cuota.
    logger.error("Rate limit no disponible en remove-background", err)
    return NextResponse.json(
      { error: "Servicio no disponible, intenta más tarde." },
      { status: 503 }
    )
  }

  // 3. Leer el archivo del FormData
  const formData = await request.formData()
  const uploadedFile = formData.get("image")
  const imageUrl = formData.get("imageUrl")
  let file: File | null = uploadedFile instanceof File ? uploadedFile : null

  if (!file && typeof imageUrl === "string" && imageUrl.trim()) {
    try {
      const blob = await fetchImageSafely(imageUrl.trim())
      file = new File([blob], "imagen-existente", { type: blob.type || "image/png" })
    } catch (err) {
      logger.warn("No se pudo descargar imagen existente para quitar fondo", { err: String(err) })
      return NextResponse.json(
        { error: "No se pudo descargar la imagen actual" },
        { status: 400 }
      )
    }
  }

  if (!file) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 })
  }

  // 4. Validaciones de tamaño y tipo (bajado a 5 MB).
  const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Imagen demasiado grande (máximo 5 MB)" }, { status: 400 })
  }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 })
  }

  // 5. Llamar a remove.bg desde el servidor
  const removeBgFormData = new FormData()
  removeBgFormData.append("image_file", file)
  removeBgFormData.append("size", "auto")

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.REMOVEBG_API_KEY!,
    },
    body: removeBgFormData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error("Error de remove.bg", { status: response.status, body: errorText })
    return NextResponse.json(
      { error: "No se pudo procesar la imagen" },
      { status: 502 }
    )
  }

  const imageBuffer = await response.arrayBuffer()
  return new NextResponse(imageBuffer, {
    headers: {
      "Content-Type": "image/png",
    },
  })
}
