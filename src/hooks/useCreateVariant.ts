import { useRef, useState } from "react"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"
import { useUploadImage } from "@/hooks/useUploadImage"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import { createVariantAction } from "@/app/actions/variant-actions"
import { invalidateProductCaches } from "@/lib/cache-invalidation"
import { CreateVariantSchema } from "@/lib/validation/variant"

type PendingCreateVariant = {
  productId: number
  name: string
  description?: string | null
  price: number
  imageUrl: string | null
  imagePublicId: string | null
}

export function useCreateVariant(productId: number) {
  const { uploadImage, uploading } = useUploadImage()

  const [variantName, setVariantName] = useState("")
  const [variantDescription, setVariantDescription] = useState("")
  const [variantPrice, setVariantPrice] = useState("")
  const [variantImage, setVariantImage] = useState<File | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const pendingPayloadRef = useRef<PendingCreateVariant | null>(null)

  const { run: createVariantWithRetry, isPending } = useOfflineRetry(async () => {
    const payload = pendingPayloadRef.current
    if (!payload) return

    const result = await createVariantAction(payload)

    if (!result.ok) {
      throw new Error(result.error)
    }

    invalidateProductCaches()
  })

  async function createVariant() {
    if (loading || uploading) return

    try {
      setLoading(true)
      setError("")

      let imageUrl: string | null = null
      let imagePublicId: string | null = null

      if (variantImage) {
        const uploaded = await uploadImage(
          variantImage,
          process.env.NEXT_PUBLIC_CLOUDINARY_PRODUCTS_PRESET!
        )

        if (!uploaded) throw new Error("Error al subir imagen")

        imageUrl = uploaded.secure_url
        imagePublicId = uploaded.public_id
      }

      const payload = {
        productId,
        name: variantName.trim(),
        description: variantDescription.trim() || null,
        price: Number(variantPrice),
        imageUrl,
        imagePublicId,
      }

      const validation = CreateVariantSchema.safeParse(payload)
      if (!validation.success) {
        throw new Error(validation.error.issues[0]?.message ?? "Datos inválidos")
      }

      pendingPayloadRef.current = validation.data
      await createVariantWithRetry()

      setVariantName("")
      setVariantDescription("")
      setVariantPrice("")
      setVariantImage(null)
    } catch (err: unknown) {
      handleMutationError(err, {
        logTag: "Error creando variante",
        fallback: "Error al crear variante",
        setError,
      })
    } finally {
      setLoading(false)
    }
  }

  return {
    variantName, setVariantName,
    variantDescription, setVariantDescription,
    variantPrice, setVariantPrice,
    variantImage, setVariantImage,
    loading: loading || uploading || isPending,
    error,
    createVariant,
  }
}
