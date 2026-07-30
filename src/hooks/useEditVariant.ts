import { useRef, useState } from "react"
import { useOfflineRetry } from "@/hooks/useOfflineRetry"
import { useUploadImage } from "@/hooks/useUploadImage"
import { handleMutationError } from "@/lib/hooks/handle-mutation-error"
import { updateVariantAction } from "@/app/actions/variant-actions"
import { invalidateProductCaches } from "@/lib/cache-invalidation"
import { UpdateVariantSchema } from "@/lib/validation/variant"
import type { ProductVariant } from "@/types/product-variant"

type PendingUpdateVariant = {
  variantId: number
  name: string
  description?: string | null
  price: number
  imageUrl: string | null
  imagePublicId: string | null
}

export function useEditVariant(variant: ProductVariant) {
  const { uploadImage, uploading } = useUploadImage()

  const [variantName, setVariantName] = useState(variant.variant_name)
  const [variantDescription, setVariantDescription] = useState(variant.variant_description ?? "")
  const [variantPrice, setVariantPrice] = useState(String(variant.variant_price))
  const [variantImage, setVariantImage] = useState<File | null>(null)
  const [currentImageUrl] = useState<string | null>(variant.variant_image)
  const [currentImagePublicId] = useState<string | null>(variant.variant_image_public_id)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const pendingPayloadRef = useRef<PendingUpdateVariant | null>(null)

  const { run: updateVariantWithRetry, isPending } = useOfflineRetry(async () => {
    const payload = pendingPayloadRef.current
    if (!payload) return

    const result = await updateVariantAction(payload)

    if (!result.ok) {
      throw new Error(result.error)
    }

    invalidateProductCaches()
  })

  async function updateVariant() {
    if (loading || uploading) return

    try {
      setLoading(true)
      setError("")

      let imageUrl = currentImageUrl
      let imagePublicId = currentImagePublicId

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
        variantId: variant.id,
        name: variantName.trim(),
        description: variantDescription.trim() || null,
        price: Number(variantPrice),
        imageUrl,
        imagePublicId,
      }

      const validation = UpdateVariantSchema.safeParse(payload)
      if (!validation.success) {
        throw new Error(validation.error.issues[0]?.message ?? "Datos inválidos")
      }

      pendingPayloadRef.current = validation.data
      await updateVariantWithRetry()
    } catch (err: unknown) {
      handleMutationError(err, {
        logTag: "Error actualizando variante",
        fallback: "Error al guardar variante",
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
    currentImageUrl,
    loading: loading || uploading || isPending,
    error,
    updateVariant,
  }
}
