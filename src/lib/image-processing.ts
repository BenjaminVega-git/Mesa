import imageCompression from "browser-image-compression"

const DEFAULT_COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  initialQuality: 0.8,
}

export async function compressInBrowser(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, DEFAULT_COMPRESSION_OPTIONS)
    return new File([compressed], file.name, { type: compressed.type || file.type })
  } catch {
    return file
  }
}

export async function removeBackgroundRequest(file: File): Promise<File | null> {
  const formData = new FormData()
  formData.append("image", file)

  const response = await fetch("/api/remove-background", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) return null

  const blob = await response.blob()
  return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" })
}

export async function removeBackgroundFromUrlRequest(
  imageUrl: string,
  fileName = "imagen.png"
): Promise<File | null> {
  const formData = new FormData()
  formData.append("imageUrl", imageUrl)

  const response = await fetch("/api/remove-background", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) return null

  const blob = await response.blob()
  return new File([blob], fileName.replace(/\.[^.]+$/, ".png"), { type: "image/png" })
}

// Recorta los bordes 100% transparentes de un PNG para que el dibujo quede
// pegado a los límites (sin "aire" alrededor). Útil para logos: así llenan el
// círculo en vez de verse chicos y centrados. Si no hay canvas o el archivo no
// tiene transparencia útil, devuelve el archivo original sin tocarlo.
export async function trimTransparentEdges(file: File): Promise<File> {
  if (typeof document === "undefined") return file

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })

    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    ctx.drawImage(img, 0, 0)
    const { width, height } = canvas
    const { data } = ctx.getImageData(0, 0, width, height)

    let top = height, left = width, right = 0, bottom = 0
    const alphaThreshold = 10
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3]
        if (alpha > alphaThreshold) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }

    // Sin píxeles opacos (imagen vacía) o ya está ajustada: no tocar.
    if (right < left || bottom < top) return file
    const cropW = right - left + 1
    const cropH = bottom - top + 1
    if (cropW >= width && cropH >= height) return file

    const out = document.createElement("canvas")
    out.width = cropW
    out.height = cropH
    const outCtx = out.getContext("2d")
    if (!outCtx) return file
    outCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH)

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, "image/png")
    )
    if (!blob) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), {
      type: "image/png",
    })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type ProcessImageOptions = {
  removeBg?: boolean
}

export async function processImage(
  file: File,
  { removeBg = false }: ProcessImageOptions = {}
): Promise<File> {
  let current = file

  if (removeBg) {
    const withoutBg = await removeBackgroundRequest(current)
    if (withoutBg) current = withoutBg
  }

  current = await compressInBrowser(current)
  return current
}
