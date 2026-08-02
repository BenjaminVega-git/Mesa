"use server"

import { updateTag } from "next/cache"
import {
  createProduct as createProductService,
  updateProduct as updateProductService,
  deleteProduct as deleteProductService,
  updateProductStatus as updateProductStatusService,
  getProductForEdit as getProductForEditService,
  type CreatedProduct,
  type ProductForEdit,
} from "@/services/product-service"
import type {
  CreateProductInput,
  UpdateProductInput,
  DeleteProductInput,
  UpdateProductStatusInput,
} from "@/lib/validation/product"
import type { Result } from "@/services/result"

export async function createProductAction(
  input: CreateProductInput
): Promise<Result<CreatedProduct>> {
  const result = await createProductService(input)

  if (result.ok) {
    updateTag("menu")
  }

  return result
}

export async function updateProductAction(
  input: UpdateProductInput
): Promise<Result<{ id: number }>> {
  const result = await updateProductService(input)

  if (result.ok) {
    updateTag("menu")
  }

  return result
}

export async function deleteProductAction(
  input: DeleteProductInput
): Promise<Result<{ id: number }>> {
  const result = await deleteProductService(input)

  if (result.ok) {
    updateTag("menu")
  }

  return result
}

export async function updateProductStatusAction(
  input: UpdateProductStatusInput
): Promise<Result<{ id: number }>> {
  const result = await updateProductStatusService(input)

  if (result.ok) {
    updateTag("menu")
  }

  return result
}

export async function getProductForEditAction(
  productId: number
): Promise<Result<ProductForEdit>> {
  return getProductForEditService(productId)
}
