import { supabase } from "@/lib/supabase"

// 'fixed' = combo de productos fijos (precio fijo). 'build' = "arma tu promo":
// el comensal elige, por grupo, entre min..max productos de una categoría.
// 'mixed' = productos fijos + grupos de elección, con % sobre todo el combo.
export type PromoKind = "fixed" | "build" | "mixed"
export type PromoDiscountType = "percent" | "amount"

// Una línea de la promoción (producto o variante), tal como la devuelve promo_list.
export type PromotionItem = {
  product_id: number
  variant_id: number | null
  quantity: number
  product_name: string
  variant_name: string | null
  unit_price: number
  available: boolean
}

// Un grupo de elección de una promo build (ancla a una categoría de la carta).
export type PromotionGroup = {
  id: number
  name: string
  category_id: number
  category_name: string
  option_category_ids: number[]
  option_product_ids: number[]
  min_select: number
  max_select: number
  sort_order: number
  available_count: number
}

export type Promotion = {
  id: number
  kind: PromoKind
  name: string
  description: string | null
  /** Solo para kind='fixed'. En 'build'/'mixed' queda en 0 (el precio se calcula). */
  promo_price: number
  /** Solo para kind='build'/'mixed': tipo de descuento sobre el combo armado. */
  discount_type: PromoDiscountType
  /** Solo para kind='build'/'mixed': % de descuento sobre el combo armado. */
  discount_pct: number | null
  /** Solo para kind='build'/'mixed': monto fijo de descuento sobre el combo armado. */
  discount_amount: number | null
  image_url: string | null
  active: boolean
  sort_order: number
  items: PromotionItem[]
  original_total: number
  groups: PromotionGroup[]
}

export type PromotionItemInput = {
  product_id: number
  variant_id: number | null
  quantity: number
}

export type PromotionGroupInput = {
  category_id: number
  name: string
  option_category_ids: number[]
  option_product_ids: number[]
  min_select: number
  max_select: number
  sort_order: number
}

export type PromotionInput = {
  id: number | null
  kind: PromoKind
  name: string
  description: string | null
  /** Precio del combo fijo. En 'build'/'mixed' se ignora (mandar 0). */
  promo_price: number
  /** Tipo de descuento del combo build/mixed. En 'fixed' se ignora. */
  discount_type: PromoDiscountType
  /** % de descuento del combo build/mixed (1-100). En 'fixed' o monto fijo va null. */
  discount_pct: number | null
  /** Monto fijo del combo build/mixed. En 'fixed' o porcentaje va null. */
  discount_amount: number | null
  image_url: string | null
  active: boolean
  items: PromotionItemInput[]
  groups: PromotionGroupInput[]
}

// Producto de la carta para el selector del diálogo (con sus variantes).
export type SelectableVariant = { id: number; variant_name: string; variant_price: number }
export type SelectableProduct = {
  id: number
  product_name: string
  product_price: number
  category_id: number | null
  variants: SelectableVariant[]
}

/** % de descuento de una promo respecto al precio original de carta (0-100). */
export function promoDiscountPct(originalTotal: number, promoPrice: number): number {
  if (!originalTotal || originalTotal <= 0) return 0
  const pct = Math.round((1 - promoPrice / originalTotal) * 100)
  return Math.max(0, Math.min(100, pct))
}

export async function listPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase.rpc("promo_list")
  if (error) throw error
  return (data ?? []) as Promotion[]
}

export async function savePromotion(input: PromotionInput): Promise<number> {
  const { data, error } = await supabase.rpc("promo_save", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_promo_price: input.promo_price,
    p_image_url: input.image_url,
    p_active: input.active,
    p_items: input.items,
    p_kind: input.kind,
    p_groups: input.groups,
    p_discount_type: input.discount_type,
    p_discount_pct: input.discount_pct,
    p_discount_amount: input.discount_amount,
  })
  if (error) throw error
  return data as number
}

export async function setPromotionActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("promo_set_active", { p_id: id, p_active: active })
  if (error) throw error
}

export async function deletePromotion(id: number): Promise<void> {
  const { error } = await supabase.rpc("promo_delete", { p_id: id })
  if (error) throw error
}

/** Productos de la carta (con variantes) para armar una promoción. */
export async function listSelectableProducts(restaurantId: number): Promise<SelectableProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, product_price, category_id, product_variants(id, variant_name, variant_price)")
    .eq("restaurant_id", restaurantId)
    .order("product_name", { ascending: true })
    .limit(500)
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id as number,
    product_name: p.product_name as string,
    product_price: p.product_price as number,
    category_id: (p.category_id as number | null) ?? null,
    variants: ((p.product_variants ?? []) as SelectableVariant[]).sort((a, b) =>
      a.variant_name.localeCompare(b.variant_name)
    ),
  }))
}
