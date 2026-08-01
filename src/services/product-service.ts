import { revalidateTag, revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  CreateProductSchema,
  UpdateProductSchema,
  DeleteProductSchema,
  UpdateProductStatusSchema,
  AssignProductScanCodeSchema,
  type CreateProductInput,
  type UpdateProductInput,
  type DeleteProductInput,
  type UpdateProductStatusInput,
  type AssignProductScanCodeInput,
} from "@/lib/validation/product"
import { ok, fail, type Result } from "@/services/result"
import { deleteImagesBestEffort } from "@/lib/cloudinary/delete-image-server"
import { requireAdminForRestaurant } from "@/services/auth-guard"
import { menuTag } from "@/lib/menu/menu-cache"

export type CreatedProduct = {
  id: number
}

export type ProductForEdit = {
  id: number
  name: string
  description: string | null
  scanCode: string | null
  categoryId: number
  variants: Array<{
    id: number
    name: string
    description: string | null
    price: number
    imageUrl: string | null
    imagePublicId: string | null
  }>
  menuOptions: Array<{
    id: number
    name: string
    extraPrice: number
  }>
  fallbackPrice: number
  fallbackImageUrl: string | null
  fallbackImagePublicId: string | null
  fallbackImageRecortada: boolean
}

function revalidateMenu(restaurantId: number) {
  revalidateTag(menuTag(restaurantId), "max")
  revalidatePath("/[id]/menu", "page")
}


async function getRestaurantIdForProduct(productId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("products")
    .select("restaurant_id")
    .eq("id", productId)
    .maybeSingle()
  return data?.restaurant_id ?? null
}


export async function getProductForEdit(productId: number): Promise<Result<ProductForEdit>> {
  if (!productId || productId <= 0) {
    return fail("Producto no encontrado")
  }

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const [productRes, variantsRes, menuOptionsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, product_name, product_description, product_price, product_image, product_image_public_id, scan_code, category_id, image_recortada")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("id, variant_name, variant_description, variant_price, variant_image, variant_image_public_id")
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
    supabase
      .from("product_menu_options")
      .select("id, name, extra_price")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ])

  if (productRes.error) return fail("Error al cargar producto")
  if (!productRes.data) return fail("Producto no encontrado")
  if (variantsRes.error) return fail("Error al cargar variantes")
  if (menuOptionsRes.error) return fail("Error al cargar opciones avanzadas")

  return ok({
    id: productRes.data.id,
    name: productRes.data.product_name,
    description: productRes.data.product_description,
    scanCode: productRes.data.scan_code ?? null,
    categoryId: productRes.data.category_id,
    fallbackPrice: productRes.data.product_price,
    fallbackImageUrl: productRes.data.product_image,
    fallbackImagePublicId: productRes.data.product_image_public_id,
    fallbackImageRecortada: productRes.data.image_recortada ?? false,
    variants: (variantsRes.data ?? []).map((variant) => ({
      id: variant.id,
      name: variant.variant_name,
      description: variant.variant_description ?? null,
      price: variant.variant_price,
      imageUrl: variant.variant_image,
      imagePublicId: variant.variant_image_public_id,
    })),
    menuOptions: (menuOptionsRes.data ?? []).map((option) => ({
      id: option.id,
      name: option.name,
      extraPrice: option.extra_price,
    })),
  })
}


export async function createProduct(input: CreateProductInput): Promise<Result<CreatedProduct>> {
  const validation = CreateProductSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { name, description, categoryId, restaurantId, options, menuOptions } = validation.data

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const coverIndex = Math.floor((options.length - 1) / 2)
  const coverOption = options[coverIndex]

  const { data: productData, error: productError } = await supabase
    .from("products")
    .insert({
      product_name: name,
      product_description: description,
      product_price: coverOption.price,
      product_image: coverOption.imageUrl,
      product_image_public_id: coverOption.imagePublicId,
      image_recortada: coverOption.imageRecortada,
      category_id: categoryId,
      restaurant_id: restaurantId,
      status_id: 1,
    })
    .select("id")
    .single()

  if (productError || !productData) {
    return fail(`Error al crear el producto: ${productError?.message ?? "desconocido"}`)
  }

  if (options.length > 1) {
    const { error: variantsError } = await supabase
      .from("product_variants")
      .insert(
        options.map((option) => ({
          product_id: productData.id,
          variant_name: option.name,
          variant_description: option.description ?? null,
          variant_price: option.price,
          variant_image: option.imageUrl,
          variant_image_public_id: option.imagePublicId,
        }))
      )

    if (variantsError) {
      await supabase.from("products").delete().eq("id", productData.id)
      return fail("Error al crear las variantes del producto")
    }
  }

  if (menuOptions.length > 0) {
    const { error: menuOptionsError } = await supabase
      .from("product_menu_options")
      .insert(
        menuOptions.map((option, index) => ({
          product_id: productData.id,
          restaurant_id: restaurantId,
          name: option.name,
          extra_price: option.extraPrice,
          sort_order: index,
        }))
      )

    if (menuOptionsError) {
      await supabase.from("products").delete().eq("id", productData.id)
      return fail("Error al crear las opciones avanzadas del producto")
    }
  }

  revalidateMenu(restaurantId)
  return ok({ id: productData.id })
}


export async function updateProduct(input: UpdateProductInput): Promise<Result<{ id: number }>> {
  const validation = UpdateProductSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { productId, name, description, categoryId, options, initialVariantIds, menuOptions } = validation.data

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const [previousProductRes, previousVariantsRes] = await Promise.all([
    supabase
      .from("products")
      .select("product_image_public_id")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("id, variant_image_public_id")
      .eq("product_id", productId),
  ])

  const previousProductImagePublicId = previousProductRes.data?.product_image_public_id ?? null
  const previousVariantImagePublicIds = new Map<number, string | null>(
    (previousVariantsRes.data ?? []).map((v) => [v.id, v.variant_image_public_id])
  )

  const coverIndex = Math.floor((options.length - 1) / 2)
  const coverOption = options[coverIndex]

  const { error: productError } = await supabase
    .from("products")
    .update({
      product_name: name,
      product_description: description,
      product_price: coverOption.price,
      product_image: coverOption.imageUrl,
      product_image_public_id: coverOption.imagePublicId,
      image_recortada: coverOption.imageRecortada,
      category_id: categoryId,
    })
    .eq("id", productId)

  if (productError) return fail("Error al actualizar producto")

  const orphanedImagePublicIds: Array<string | null | undefined> = []

  if (previousProductImagePublicId && previousProductImagePublicId !== coverOption.imagePublicId) {
    orphanedImagePublicIds.push(previousProductImagePublicId)
  }

  if (options.length === 1) {
    for (const [, publicId] of previousVariantImagePublicIds) {
      if (publicId) orphanedImagePublicIds.push(publicId)
    }

    const { error: deleteError } = await supabase
      .from("product_variants")
      .delete()
      .eq("product_id", productId)

    if (deleteError) return fail("Error al eliminar variantes antiguas")
  } else {
    const currentVariantIds = options
      .map((option) => option.variantId)
      .filter((variantId): variantId is number => Boolean(variantId))

    const removedVariantIds = initialVariantIds.filter(
      (variantId) => !currentVariantIds.includes(variantId)
    )

    if (removedVariantIds.length > 0) {
      for (const variantId of removedVariantIds) {
        const publicId = previousVariantImagePublicIds.get(variantId)
        if (publicId) orphanedImagePublicIds.push(publicId)
      }

      const { error: deleteError } = await supabase
        .from("product_variants")
        .delete()
        .in("id", removedVariantIds)

      if (deleteError) return fail("Error al eliminar variantes")
    }

    for (const option of options) {
      if (option.variantId) {
        const previousPublicId = previousVariantImagePublicIds.get(option.variantId) ?? null
        if (previousPublicId && previousPublicId !== option.imagePublicId) {
          orphanedImagePublicIds.push(previousPublicId)
        }

        const { error: updateError } = await supabase
          .from("product_variants")
          .update({
            variant_name: option.name,
            variant_description: option.description ?? null,
            variant_price: option.price,
            variant_image: option.imageUrl,
            variant_image_public_id: option.imagePublicId,
          })
          .eq("id", option.variantId)

        if (updateError) return fail("Error al actualizar variante")
      } else {
        const { error: insertError } = await supabase
          .from("product_variants")
          .insert({
            product_id: productId,
            variant_name: option.name,
            variant_description: option.description ?? null,
            variant_price: option.price,
            variant_image: option.imageUrl,
            variant_image_public_id: option.imagePublicId,
          })

        if (insertError) return fail("Error al insertar nueva variante")
      }
    }
  }

  if (orphanedImagePublicIds.length > 0) {
    await deleteImagesBestEffort(orphanedImagePublicIds)
  }

  const { error: deleteMenuOptionsError } = await supabase
    .from("product_menu_options")
    .delete()
    .eq("product_id", productId)

  if (deleteMenuOptionsError) return fail("Error al actualizar opciones avanzadas")

  if (menuOptions.length > 0) {
    const { error: insertMenuOptionsError } = await supabase
      .from("product_menu_options")
      .insert(
        menuOptions.map((option, index) => ({
          product_id: productId,
          restaurant_id: restaurantId,
          name: option.name,
          extra_price: option.extraPrice,
          sort_order: index,
        }))
      )

    if (insertMenuOptionsError) return fail("Error al guardar opciones avanzadas")
  }

  revalidateMenu(restaurantId)
  return ok({ id: productId })
}


export async function deleteProduct(input: DeleteProductInput): Promise<Result<{ id: number }>> {
  const validation = DeleteProductSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { productId } = validation.data

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const [productImageRes, variantImagesRes] = await Promise.all([
    supabase
      .from("products")
      .select("product_image_public_id")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("variant_image_public_id")
      .eq("product_id", productId),
  ])

  const publicIds: Array<string | null | undefined> = [
    productImageRes.data?.product_image_public_id,
    ...(variantImagesRes.data ?? []).map((v) => v.variant_image_public_id),
  ]

  const { error, count } = await supabase
    .from("products")
    .delete({ count: "exact" })
    .eq("id", productId)

  if (error) {
    return fail(`Error al eliminar el producto: ${error.message}`)
  }
  if (count === 0) {
    return fail("No se borró ninguna fila. Probable bloqueo de RLS.")
  }

  await deleteImagesBestEffort(publicIds)

  revalidateMenu(restaurantId)
  return ok({ id: productId })
}


export async function updateProductStatus(input: UpdateProductStatusInput): Promise<Result<{ id: number }>> {
  const validation = UpdateProductStatusSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { productId, statusId } = validation.data

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { error } = await supabase
    .from("products")
    .update({ status_id: statusId })
    .eq("id", productId)

  if (error) {
    return fail("Error al actualizar el estado del producto")
  }

  revalidateMenu(restaurantId)
  return ok({ id: productId })
}


export async function assignProductScanCode(input: AssignProductScanCodeInput): Promise<Result<{ id: number; scanCode: string }>> {
  const validation = AssignProductScanCodeSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos invalidos")
  }

  const { productId } = validation.data
  const scanCode = validation.data.scanCode.trim()

  const restaurantId = await getRestaurantIdForProduct(productId)
  if (!restaurantId) return fail("Producto no encontrado")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { error } = await supabase
    .from("products")
    .update({ scan_code: scanCode })
    .eq("id", productId)

  if (error) {
    if (error.code === "23505") {
      return fail("Ese codigo ya esta asociado a otro producto")
    }
    return fail("Error al guardar el codigo del producto")
  }

  revalidateMenu(restaurantId)
  return ok({ id: productId, scanCode })
}
