"use server"

// TOMA DE PEDIDOS por el MESERO (POS) — mecanismo alternativo, SIN QR.
//
// A diferencia de la primera versión (que reutilizaba create_public_order_qr
// leyendo el qr_token de la mesa), esto ahora es un circuito propio del
// staff: staff_get_menu() trae la carta completa (con las opciones de
// personalización de ingredientes) directo por RLS de su restaurante, y
// createPosOrder() llama a staff_create_order() — no depende de que la mesa
// tenga un QR activo, ni de los límites pensados para un comensal anónimo.
// Comparte el mismo motor de precios/stock/promos vía los helpers
// _process_order_items / _apply_order_coupon.

import { requireCurrentStaff } from "@/services/auth-guard"
import type { CreatedOrder } from "@/services/order-service"
import type { CreateOrderItemInput } from "@/lib/validation/order"
import { ok, fail, type Result } from "@/services/result"
import type { MenuData } from "@/types/menu"

export type PosTable = {
  id: number
  tableNumber: number | null
  /** Mesa con mesero asignado (ocupada). El staff igual puede pedir en ella. */
  claimed: boolean
}

export type PosData = {
  tables: PosTable[]
  menu: Pick<MenuData, "categories" | "products" | "promotions">
}

type StaffMenuRpcResult = {
  tables: Array<{ id: number; table_number: number | null; claimed: boolean }>
  categories: MenuData["categories"]
  products: MenuData["products"]
  promotions: MenuData["promotions"]
}

/** Mesas del restaurante + carta completa, resueltas por la sesión del staff. */
export async function getPosData(): Promise<Result<PosData>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("staff_get_menu")
  if (error || !data) return fail("No se pudo cargar la carta")

  const result = data as StaffMenuRpcResult
  return ok({
    tables: result.tables.map((t) => ({
      id: t.id,
      tableNumber: t.table_number,
      claimed: t.claimed,
    })),
    menu: {
      categories: result.categories ?? [],
      products: result.products ?? [],
      promotions: result.promotions ?? [],
    },
  })
}

export type PosOrderResult = CreatedOrder & { tableNumber: number | null }

type StaffOrderRpcResult = {
  id: number
  status_id: number
  status_name: string | null
  created_at: string
  table_id: number
  restaurant_id: number
  total: number
  discount_amount: number
}

/**
 * Crea el pedido para una mesa por el mecanismo del staff (sin QR). Si quien
 * pide es un MESERO y la mesa está libre, la reclama para él.
 */
export async function createPosOrder(
  tableId: number,
  items: CreateOrderItemInput[]
): Promise<Result<PosOrderResult>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase, roleId, userId } = auth.data

  const rpcItems = items.map((item) => ({
    product_id: item.productId ?? null,
    variant_id: item.variantId ?? null,
    promotion_id: item.promotionId ?? null,
    selections: item.selections
      ? item.selections.map((s) => ({
          group_id: s.groupId,
          product_id: s.productId,
          variant_id: s.variantId ?? null,
        }))
      : null,
    ingredient_choices: item.ingredientChoices
      ? item.ingredientChoices.map((c) => ({ ingredient_id: c.ingredientId, action: c.action }))
      : null,
    quantity: item.productQuantity,
    notes: item.notes ?? null,
  }))

  const { data, error } = await supabase.rpc("staff_create_order", {
    p_table_id: tableId,
    p_items: rpcItems,
  })
  if (error) return fail(error.message ?? "No se pudo crear el pedido")

  const result = data as StaffOrderRpcResult | null
  if (!result?.id) return fail("No se pudo crear el pedido")

  // Mesero en mesa libre → reclamarla (best-effort; el pedido ya existe).
  if (roleId === 1) {
    const { data: table } = await supabase
      .from("tables")
      .select("current_waiter_id, table_number")
      .eq("id", tableId)
      .maybeSingle()
    if (table && table.current_waiter_id == null) {
      const { data: me } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", userId)
        .maybeSingle()
      if (me?.id) {
        await supabase.rpc("reassign_table", { p_table_id: tableId, p_new_waiter_id: me.id })
      }
    }
  }

  const { data: tableRow } = await supabase
    .from("tables")
    .select("table_number")
    .eq("id", tableId)
    .maybeSingle()

  return ok({
    id: result.id,
    statusId: result.status_id,
    statusName: result.status_name,
    createdAt: result.created_at,
    tableId: result.table_id,
    restaurantId: result.restaurant_id,
    total: result.total,
    tableNumber: tableRow?.table_number ?? null,
  })
}
