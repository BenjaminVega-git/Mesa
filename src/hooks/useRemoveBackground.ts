import { useState } from "react"
import { logger } from "@/lib/logger"

export function useRemoveBackground() {
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState("")

  async function removeBackground(file: File): Promise<File | null> {
    try {
      setRemoving(true)
      setError("")

      const formData = new FormData()
      formData.append("image_file", file)
      formData.append("size", "auto")

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: {
          "X-Api-Key": process.env.NEXT_PUBLIC_REMOVEBG_API_KEY!,
        },
        body: formData,
      })

      if (!response.ok) throw new Error("Error al quitar fondo")

      const blob = await response.blob()
      return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" })
    } catch (err: unknown) {
      logger.error("Error quitando fondo", err)
      setError("Error al quitar fondo")
      return null
    } finally {
      setRemoving(false)
    }
  }

  return { removeBackground, removing, error }
}
