import { logger } from "@/lib/logger"
import { deleteImagesBestEffort } from "@/lib/cloudinary/delete-image-server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * El producto de portada y una variante pueden compartir el mismo asset.
 * Antes de borrarlo de Cloudinary se comprueba que ninguna fila vigente siga
 * apuntando a ese public_id. Ante un error de consulta se conserva el archivo.
 */
export async function deleteUnreferencedProductImages(
  supabase: SupabaseServerClient,
  publicIds: Array<string | null | undefined>
): Promise<void> {
  const candidates = [...new Set(publicIds.filter((id): id is string => Boolean(id)))]
  if (candidates.length === 0) return

  const [productsRes, variantsRes] = await Promise.all([
    supabase
      .from("products")
      .select("product_image_public_id")
      .in("product_image_public_id", candidates),
    supabase
      .from("product_variants")
      .select("variant_image_public_id")
      .in("variant_image_public_id", candidates),
  ])

  if (productsRes.error || variantsRes.error) {
    logger.warn("No se pudo comprobar si las imágenes siguen en uso; se conservan", {
      productsError: productsRes.error?.message,
      variantsError: variantsRes.error?.message,
    })
    return
  }

  const referenced = new Set<string>()
  for (const product of productsRes.data ?? []) {
    if (product.product_image_public_id) referenced.add(product.product_image_public_id)
  }
  for (const variant of variantsRes.data ?? []) {
    if (variant.variant_image_public_id) referenced.add(variant.variant_image_public_id)
  }

  await deleteImagesBestEffort(candidates.filter((publicId) => !referenced.has(publicId)))
}
