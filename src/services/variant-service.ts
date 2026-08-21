import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  CreateVariantSchema,
  UpdateVariantSchema,
  DeleteVariantSchema,
  type CreateVariantInput,
  type UpdateVariantInput,
  type DeleteVariantInput,
} from "@/lib/validation/variant"
import { ok, fail, type Result } from "@/services/result"
import { deleteImageBestEffort } from "@/lib/cloudinary/delete-image-server"
import { requireAdminForRestaurant } from "@/services/auth-guard"
import { revalidatePublicMenu } from "@/lib/menu/menu-cache"

export type CreatedVariant = {
  id: number
}

/**
 * Invalida el cache del menú del restaurante (tag por restaurante) y la ruta.
 * Las variantes aparecen en el menú, por eso se invalida tras cambiarlas.
 */
function revalidateMenu(restaurantId: number) {
  revalidatePublicMenu(restaurantId)
}

/**
 * Lee restaurant_id desde un producto. Helper interno para validar permisos
 * cuando la action recibe productId.
 */
async function getRestaurantIdForProduct(productId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("products")
    .select("restaurant_id")
    .eq("id", productId)
    .maybeSingle()
  return data?.restaurant_id ?? null
}

/**
 * Lee restaurant_id desde una variante (vía su product_id).
 * Helper interno para validar permisos cuando la action recibe solo variantId.
 */
async function getRestaurantIdForVariant(variantId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("product_variants")
    .select("products(restaurant_id)")
    .eq("id", variantId)
    .maybeSingle()

  const products = data?.products as { restaurant_id: number | null } | { restaurant_id: number | null }[] | null
  if (!products) return null
  const product = Array.isArray(products) ? products[0] : products
  return product?.restaurant_id ?? null
}

// ============ CREATE (admin) ============

export async function createVariant(input: CreateVariantInput): Promise<Result<CreatedVariant>> {
  const validation = CreateVariantSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { productId, name, description, price, imageUrl, imagePublicId } = validation.data

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      variant_name: name,
      variant_description: description ?? null,
      variant_price: price,
      variant_image: imageUrl,
      variant_image_public_id: imagePublicId,
    })
    .select("id")
    .single()

  if (error || !data) {
    return fail("Error al crear la variante")
  }

  revalidateMenu(restaurantId)
  return ok({ id: data.id })
}

// ============ UPDATE (admin) ============

export async function updateVariant(input: UpdateVariantInput): Promise<Result<{ id: number }>> {
  const validation = UpdateVariantSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { variantId, name, description, price, imageUrl, imagePublicId } = validation.data

  const restaurantId = await getRestaurantIdForVariant(variantId)
  if (!restaurantId) return fail("Variante no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  // Leer public_id previo para detectar si la imagen fue reemplazada
  const { data: previous } = await supabase
    .from("product_variants")
    .select("variant_image_public_id")
    .eq("id", variantId)
    .maybeSingle()

  const previousImagePublicId = previous?.variant_image_public_id ?? null

  const { error } = await supabase
    .from("product_variants")
    .update({
      variant_name: name,
      variant_description: description ?? null,
      variant_price: price,
      variant_image: imageUrl,
      variant_image_public_id: imagePublicId,
    })
    .eq("id", variantId)

  if (error) {
    return fail("Error al actualizar la variante")
  }

  if (previousImagePublicId && previousImagePublicId !== imagePublicId) {
    await deleteImageBestEffort(previousImagePublicId)
  }

  revalidateMenu(restaurantId)
  return ok({ id: variantId })
}

// ============ DELETE (admin) ============

export async function deleteVariant(input: DeleteVariantInput): Promise<Result<{ id: number }>> {
  const validation = DeleteVariantSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { variantId } = validation.data

  const restaurantId = await getRestaurantIdForVariant(variantId)
  if (!restaurantId) return fail("Variante no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  // Leer public_id antes del DELETE (post-delete no existe el row)
  const { data: previous } = await supabase
    .from("product_variants")
    .select("variant_image_public_id")
    .eq("id", variantId)
    .maybeSingle()

  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId)

  if (error) {
    return fail("Error al eliminar la variante")
  }

  await deleteImageBestEffort(previous?.variant_image_public_id)

  revalidateMenu(restaurantId)
  return ok({ id: variantId })
}
