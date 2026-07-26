"use server"

import { updateTag } from "next/cache"
import {
  listIngredients as listIngredientsService,
  createIngredient as createIngredientService,
  updateIngredient as updateIngredientService,
  deleteIngredient as deleteIngredientService,
  restockIngredient as restockIngredientService,
  setIngredientStock as setIngredientStockService,
  importIngredients as importIngredientsService,
  listMovements as listMovementsService,
  getProductRecipe as getProductRecipeService,
  setProductRecipe as setProductRecipeService,
  listProductsWithoutRecipe as listProductsWithoutRecipeService,
  applyRecipesBulk as applyRecipesBulkService,
  listProductsLite as listProductsLiteService,
  getIngredientOptions as getIngredientOptionsService,
  saveIngredientOptions as saveIngredientOptionsService,
  type ImportMode,
} from "@/services/inventory-service"
import type { IngredientOptionConfigRow } from "@/types/product"
import { suggestProductRecipe as suggestProductRecipeService } from "@/services/recipe-ai-service"
import {
  mapInventoryHeaders as mapInventoryHeadersService,
  type HeaderColumnMap,
} from "@/services/inventory-ai-service"
import type {
  CreateIngredientInput,
  UpdateIngredientInput,
  DeleteIngredientInput,
  RestockIngredientInput,
  SetIngredientStockInput,
  SetProductRecipeInput,
  ImportIngredientRowInput,
} from "@/lib/validation/inventory"
import type { Result } from "@/services/result"
import type { Ingredient, IngredientWithFlag, ImportIngredientsSummary } from "@/types/ingredient"
import type {
  ProductRecipeData,
  SuggestedRecipeItem,
  ProductLite,
  BulkRecipeEntry,
  BulkRecipeSummary,
} from "@/types/product-recipe"
import type { StockMovementWithIngredient } from "@/types/stock-movement"

export async function listIngredientsAction(): Promise<Result<IngredientWithFlag[]>> {
  return listIngredientsService()
}

export async function createIngredientAction(
  input: CreateIngredientInput
): Promise<Result<Ingredient>> {
  const result = await createIngredientService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function updateIngredientAction(
  input: UpdateIngredientInput
): Promise<Result<{ id: number }>> {
  const result = await updateIngredientService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function deleteIngredientAction(
  input: DeleteIngredientInput
): Promise<Result<{ id: number }>> {
  const result = await deleteIngredientService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function restockIngredientAction(
  input: RestockIngredientInput
): Promise<Result<{ id: number }>> {
  const result = await restockIngredientService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function setIngredientStockAction(
  input: SetIngredientStockInput
): Promise<Result<{ id: number }>> {
  const result = await setIngredientStockService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function importIngredientsAction(
  rows: ImportIngredientRowInput[],
  mode: ImportMode = "catalogo"
): Promise<Result<ImportIngredientsSummary>> {
  const result = await importIngredientsService(rows, mode)
  if (result.ok) updateTag("menu")
  return result
}

export async function mapInventoryHeadersAction(
  headers: string[],
  sampleRows: string[][]
): Promise<Result<HeaderColumnMap>> {
  return mapInventoryHeadersService(headers, sampleRows)
}

export async function listMovementsAction(
  ingredientId?: number
): Promise<Result<StockMovementWithIngredient[]>> {
  return listMovementsService(ingredientId)
}

export async function getProductRecipeAction(
  productId: number
): Promise<Result<ProductRecipeData>> {
  return getProductRecipeService(productId)
}

export async function setProductRecipeAction(
  input: SetProductRecipeInput
): Promise<Result<{ ok: true }>> {
  const result = await setProductRecipeService(input)
  if (result.ok) updateTag("menu")
  return result
}

export async function suggestRecipeAction(
  productId: number
): Promise<Result<SuggestedRecipeItem[]>> {
  return suggestProductRecipeService(productId)
}

export async function listProductsWithoutRecipeAction(): Promise<Result<ProductLite[]>> {
  return listProductsWithoutRecipeService()
}

export async function applyRecipesBulkAction(
  entries: BulkRecipeEntry[]
): Promise<Result<BulkRecipeSummary>> {
  const result = await applyRecipesBulkService(entries)
  if (result.ok) updateTag("menu")
  return result
}

export async function listProductsLiteAction(): Promise<Result<ProductLite[]>> {
  return listProductsLiteService()
}

export async function getIngredientOptionsAction(
  productId: number
): Promise<Result<IngredientOptionConfigRow[]>> {
  return getIngredientOptionsService(productId)
}

export async function saveIngredientOptionsAction(
  productId: number,
  rows: IngredientOptionConfigRow[]
): Promise<Result<{ ok: true }>> {
  const result = await saveIngredientOptionsService(productId, rows)
  if (result.ok) updateTag("menu")
  return result
}
