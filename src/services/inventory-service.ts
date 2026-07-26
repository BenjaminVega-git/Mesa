import { revalidateTag, revalidatePath } from "next/cache"
import { ok, fail, type Result } from "@/services/result"
import { requireCurrentAdmin } from "@/services/auth-guard"
import { menuTag } from "@/lib/menu/menu-cache"
import {
  CreateIngredientSchema,
  UpdateIngredientSchema,
  DeleteIngredientSchema,
  RestockIngredientSchema,
  SetIngredientStockSchema,
  SetProductRecipeSchema,
  ImportIngredientsSchema,
  type ImportIngredientRowInput,
  type CreateIngredientInput,
  type UpdateIngredientInput,
  type DeleteIngredientInput,
  type RestockIngredientInput,
  type SetIngredientStockInput,
  type SetProductRecipeInput,
} from "@/lib/validation/inventory"
import type { Ingredient, IngredientWithFlag, ImportIngredientsSummary } from "@/types/ingredient"
import type { StockMovement, StockMovementWithIngredient } from "@/types/stock-movement"
import type {
  ProductRecipeData,
  RecipeItem,
  ProductLite,
  BulkRecipeEntry,
  BulkRecipeSummary,
} from "@/types/product-recipe"
import type { IngredientOptionConfigRow } from "@/types/product"

const INGREDIENT_COLS = "id, restaurant_id, name, unit, stock_actual, stock_minimo, precio, created_at"
const MOVEMENTS_LIMIT = 100

// La disponibilidad por stock (stock_out) viaja en el menú; al cambiar recetas
// o stock manualmente hay que invalidar su cache.
function revalidateMenu(restaurantId: number) {
  revalidateTag(menuTag(restaurantId), "max")
  revalidatePath("/[id]/menu", "page")
}

// ----------------------------------------------------------------------------
// INSUMOS
// ----------------------------------------------------------------------------
export async function listIngredients(): Promise<Result<IngredientWithFlag[]>> {
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_COLS)
    .order("name", { ascending: true })

  if (error) return fail(error.message)

  const rows: IngredientWithFlag[] = (data ?? []).map((r) => ({
    ...(r as Ingredient),
    low: Number(r.stock_actual) <= Number(r.stock_minimo),
  }))
  return ok(rows)
}

export async function createIngredient(
  input: CreateIngredientInput
): Promise<Result<Ingredient>> {
  const parsed = CreateIngredientSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { data, error } = await supabase.rpc("create_ingredient", {
    p_name: parsed.data.name,
    p_unit: parsed.data.unit,
    p_stock_inicial: parsed.data.stockInicial,
    p_stock_minimo: parsed.data.stockMinimo,
    p_precio: parsed.data.precio,
  })

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok(data as Ingredient)
}

export async function updateIngredient(
  input: UpdateIngredientInput
): Promise<Result<{ id: number }>> {
  const parsed = UpdateIngredientSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  // RLS exige admin del propio restaurante. No tocamos stock_actual aquí: el
  // stock solo cambia por movimientos (reponer / ajustar).
  const { error } = await supabase
    .from("ingredients")
    .update({
      name: parsed.data.name,
      unit: parsed.data.unit,
      stock_minimo: parsed.data.stockMinimo,
      precio: parsed.data.precio,
    })
    .eq("id", parsed.data.id)

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok({ id: parsed.data.id })
}

export async function deleteIngredient(
  input: DeleteIngredientInput
): Promise<Result<{ id: number }>> {
  const parsed = DeleteIngredientSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  // Borra en cascada sus recetas y movimientos (FK on delete cascade).
  const { error } = await supabase.from("ingredients").delete().eq("id", parsed.data.id)
  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok({ id: parsed.data.id })
}

export async function restockIngredient(
  input: RestockIngredientInput
): Promise<Result<{ id: number }>> {
  const parsed = RestockIngredientSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { error } = await supabase.rpc("restock_ingredient", {
    p_ingredient_id: parsed.data.id,
    p_cantidad: parsed.data.cantidad,
    p_nota: parsed.data.nota ?? null,
  })

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok({ id: parsed.data.id })
}

export async function setIngredientStock(
  input: SetIngredientStockInput
): Promise<Result<{ id: number }>> {
  const parsed = SetIngredientStockSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { error } = await supabase.rpc("set_ingredient_stock", {
    p_ingredient_id: parsed.data.id,
    p_nuevo_stock: parsed.data.nuevoStock,
    p_motivo: parsed.data.motivo,
    p_nota: parsed.data.nota ?? null,
  })

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok({ id: parsed.data.id })
}

export type ImportMode = "catalogo" | "compra"

export async function importIngredients(
  rows: ImportIngredientRowInput[],
  mode: ImportMode = "catalogo"
): Promise<Result<ImportIngredientsSummary>> {
  const parsed = ImportIngredientsSchema.safeParse(rows)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }
  if (mode !== "catalogo" && mode !== "compra") {
    return fail("Modo de importación inválido")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { data, error } = await supabase.rpc("import_ingredients_bulk", {
    p_items: parsed.data,
    p_mode: mode,
  })

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok(data as ImportIngredientsSummary)
}

// ----------------------------------------------------------------------------
// MOVIMIENTOS (historial)
// ----------------------------------------------------------------------------
export async function listMovements(
  ingredientId?: number
): Promise<Result<StockMovementWithIngredient[]>> {
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  let query = supabase
    .from("stock_movements")
    .select("id, restaurant_id, ingredient_id, delta, motivo, order_id, user_id, nota, created_at, ingredients(name)")
    .order("created_at", { ascending: false })
    .limit(MOVEMENTS_LIMIT)

  if (ingredientId) {
    query = query.eq("ingredient_id", ingredientId)
  }

  const { data, error } = await query
  if (error) return fail(error.message)

  const rows: StockMovementWithIngredient[] = (data ?? []).map((r) => {
    const { ingredients, ...rest } = r as StockMovement & {
      ingredients: { name: string } | { name: string }[] | null
    }
    const ing = Array.isArray(ingredients) ? ingredients[0] : ingredients
    return { ...(rest as StockMovement), ingredient_name: ing?.name ?? null }
  })
  return ok(rows)
}

// ----------------------------------------------------------------------------
// RECETAS
// ----------------------------------------------------------------------------
export async function getProductRecipe(
  productId: number
): Promise<Result<ProductRecipeData>> {
  if (!productId || productId <= 0) return fail("Producto no encontrado")

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const variantsRes = await supabase
    .from("product_variants")
    .select("id, variant_name")
    .eq("product_id", productId)
    .order("id", { ascending: true })

  if (variantsRes.error) return fail(variantsRes.error.message)

  const variants = (variantsRes.data ?? []).map((v) => ({
    id: v.id as number,
    name: v.variant_name as string,
  }))
  const variantIds = new Set(variants.map((v) => v.id))
  const hasVariants = variants.length > 0

  // Receta del producto + de sus variantes (no de otros productos).
  const orFilters = [`product_id.eq.${productId}`]
  if (variantIds.size > 0) {
    orFilters.push(`variant_id.in.(${[...variantIds].join(",")})`)
  }
  const recipesRes = await supabase
    .from("product_recipes")
    .select("product_id, variant_id, ingredient_id, cantidad, bloquea")
    .or(orFilters.join(","))

  if (recipesRes.error) return fail(recipesRes.error.message)

  const productRecipe: RecipeItem[] = []
  const variantRecipes: Record<number, RecipeItem[]> = {}
  for (const v of variants) variantRecipes[v.id] = []

  for (const r of recipesRes.data ?? []) {
    const item: RecipeItem = {
      ingredientId: r.ingredient_id as number,
      cantidad: Number(r.cantidad),
      bloquea: (r.bloquea as boolean | null) ?? true,
    }
    if (r.variant_id != null && variantIds.has(r.variant_id as number)) {
      variantRecipes[r.variant_id as number].push(item)
    } else if (r.product_id === productId) {
      productRecipe.push(item)
    }
  }

  return ok({ productId, hasVariants, variants, productRecipe, variantRecipes })
}

export async function setProductRecipe(
  input: SetProductRecipeInput
): Promise<Result<{ ok: true }>> {
  const parsed = SetProductRecipeSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Datos inválidos")
  }

  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { error } = await supabase.rpc("set_product_recipe", {
    p_product_id: parsed.data.productId,
    p_variant_id: parsed.data.variantId,
    p_items: parsed.data.items.map((i) => ({
      ingredient_id: i.ingredientId,
      cantidad: i.cantidad,
      bloquea: i.bloquea,
    })),
  })

  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok({ ok: true })
}

// Productos del restaurante que aún no tienen receta (ni a nivel producto ni
// en ninguna de sus variantes). Útil para el generador masivo con IA.
export async function listProductsWithoutRecipe(): Promise<Result<ProductLite[]>> {
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const [prodRes, recipeRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, product_name")
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true }),
    supabase.from("product_recipes").select("product_id, variant_id").eq("restaurant_id", restaurantId),
  ])
  if (prodRes.error) return fail(prodRes.error.message)
  if (recipeRes.error) return fail(recipeRes.error.message)

  const products: ProductLite[] = (prodRes.data ?? []).map((p) => ({
    id: p.id as number,
    name: p.product_name as string,
  }))

  const withRecipe = new Set<number>()
  const variantRecipeIds: number[] = []
  for (const r of recipeRes.data ?? []) {
    if (r.product_id != null) withRecipe.add(r.product_id as number)
    else if (r.variant_id != null) variantRecipeIds.push(r.variant_id as number)
  }

  if (variantRecipeIds.length > 0) {
    const { data: vData, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .in("id", variantRecipeIds)
    if (vErr) return fail(vErr.message)
    for (const v of vData ?? []) withRecipe.add(v.product_id as number)
  }

  return ok(products.filter((p) => !withRecipe.has(p.id)))
}

// Aplica en lote las recetas sugeridas por la IA (deduplicando insumos y
// creando los que falten a stock 0). Una sola RPC atómica.
export async function applyRecipesBulk(
  entries: BulkRecipeEntry[]
): Promise<Result<BulkRecipeSummary>> {
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  if (!Array.isArray(entries) || entries.length === 0) {
    return fail("Sin productos para procesar")
  }
  if (entries.length > 500) {
    return fail("Demasiados productos (máx 500)")
  }

  const payload = entries.map((e) => ({
    product_id: e.productId,
    items: (e.items ?? []).map((it) => ({
      ingredient_id: it.existingId,
      name: it.name,
      unit: it.unit,
      cantidad: it.cantidad,
    })),
  }))

  const { data, error } = await supabase.rpc("apply_recipes_bulk", { p_entries: payload })
  if (error) return fail(error.message)
  revalidateMenu(restaurantId)
  return ok(data as BulkRecipeSummary)
}

// ----------------------------------------------------------------------------
// PERSONALIZACIÓN DE INGREDIENTES: qué insumos puede quitar (gratis) o
// agregar (con precio) el comensal en cada producto. Vive en Inventario
// porque configura insumos reales (con su unidad y, en los extras, cuánto
// stock consumen) — no es una propiedad del producto en sí.
// ----------------------------------------------------------------------------

// Todos los productos del restaurante (para el selector del panel).
export async function listProductsLite(): Promise<Result<ProductLite[]>> {
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const { data, error } = await supabase
    .from("products")
    .select("id, product_name")
    .eq("restaurant_id", restaurantId)
    .order("product_name", { ascending: true })
  if (error) return fail(error.message)

  return ok((data ?? []).map((p) => ({ id: p.id as number, name: p.product_name as string })))
}

type IngredientOptionRpcRow = {
  ingredient_id: number
  name: string
  unit: string
  kind: "removable" | "extra" | null
  extra_price: number
  quantity: number
}

// Insumos del restaurante + su configuración actual para este producto
// (kind=null = todavía sin configurar, la UI lo ofrece como "No aplica").
export async function getIngredientOptions(productId: number): Promise<Result<IngredientOptionConfigRow[]>> {
  if (!productId || productId <= 0) return fail("Producto no encontrado")
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase.rpc("admin_list_ingredient_options", { p_product_id: productId })
  if (error) return fail(error.message ?? "No se pudieron cargar los insumos")

  const rows = (data ?? []) as IngredientOptionRpcRow[]
  return ok(
    rows.map((r) => ({
      ingredientId: r.ingredient_id,
      name: r.name,
      unit: r.unit,
      kind: r.kind,
      extraPrice: Number(r.extra_price ?? 0),
      quantity: Number(r.quantity ?? 1),
    }))
  )
}

// Reemplaza toda la configuración del producto de una vez (solo las filas
// con kind fijado — "No aplica" simplemente no se envía).
export async function saveIngredientOptions(
  productId: number,
  rows: IngredientOptionConfigRow[]
): Promise<Result<{ ok: true }>> {
  if (!productId || productId <= 0) return fail("Producto no encontrado")
  const guard = await requireCurrentAdmin()
  if (!guard.ok) return fail(guard.error)
  const { supabase, restaurantId } = guard.data

  const options = rows
    .filter((r) => r.kind === "removable" || r.kind === "extra")
    .map((r) => ({
      ingredient_id: r.ingredientId,
      kind: r.kind,
      extra_price: r.kind === "extra" ? Math.max(0, Math.round(r.extraPrice)) : 0,
      quantity: r.kind === "extra" ? Math.max(0.01, r.quantity || 1) : 1,
    }))

  const { error } = await supabase.rpc("admin_save_ingredient_options", {
    p_product_id: productId,
    p_options: options,
  })
  if (error) return fail(error.message ?? "No se pudo guardar la configuración")

  revalidateMenu(restaurantId)
  return ok({ ok: true })
}
