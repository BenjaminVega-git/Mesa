import { useState } from "react"
import { logger } from "@/lib/logger"
import { useRemoveBackground } from "@/hooks/useRemoveBackground"

type UploadResult = {
  secure_url: string
  public_id: string
} | null

export function useUploadImage() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const { removeBackground } = useRemoveBackground()

  async function uploadImage(file: File, preset: string): Promise<UploadResult> {
    try {
      setUploading(true)
      setError("")

      const processedFile = await removeBackground(file)
      if (!processedFile) throw new Error("Error al procesar imagen")

      const formData = new FormData()
      formData.append("file", processedFile)
      formData.append("upload_preset", preset)

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      )

      if (!response.ok) throw new Error("Error al subir imagen")

      const data = await response.json()

      return {
        secure_url: data.secure_url,
        public_id: data.public_id,
      }
    } catch (err: unknown) {
      logger.error("Error subiendo imagen", err)
      setError("Error al subir imagen")
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploadImage, uploading, error }
}
