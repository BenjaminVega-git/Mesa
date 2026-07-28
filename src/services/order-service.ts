import { revalidateTag } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  CreateOrderSchema,
  type CreateOrderInput,
} from "@/lib/validation/order"
import { ok, fail, type Result } from "@/services/result"
import { requireStaffForRestaurant } from "@/services/auth-guard"
import { menuTag } from "@/lib/menu/menu-cache"

export const ORDER_STATUS_NUEVO = 1
export const ORDER_STATUS_PREPARANDO = 2
export const ORDER_STATUS_LISTO = 3
export const ORDER_STATUS_PAGADO = 4

export type WaiterOrderItem = {
  id: number
  productName: string
  variantName: string | null
  productPrice: number
  productQuantity: number
  notes: string | null
}

export type WaiterOrder = {
  id: number
  readyAt: string | null
  tableId: number | null
  tableNumber: number | null
  total: number
  statusId: number
  createdAt: string | null
  dinerSlot: number | null
  dinerLabel: string | null
  items: WaiterOrderItem[]
}

type OrderRow = {
  id: number
  table_id: number | null
  total: number | null
  status_id: number | null
  created_at: string | null
  ready_at: string | null
  diner_slot: number | null
  diner_label: string | null
  tables: { table_number: number | null } | null
  order_items: Array<{
    id: number
    product_name: string | null
    variant_name: string | null
    product_price: number | null
    product_quantity: number
    notes: string | null
  }> | null
}

function mapOrderRow(row: OrderRow): WaiterOrder {
  return {
    id: row.id,
    tableId: row.table_id,
    tableNumber: row.tables?.table_number ?? null,
    total: row.total ?? 0,
    statusId: row.status_id ?? ORDER_STATUS_NUEVO,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    dinerSlot: row.diner_slot,
    dinerLabel: row.diner_label,
    items: (row.order_items ?? []).map((it) => ({
      id: it.id,
      productName: it.product_name ?? "",
      variantName: it.variant_name,
      productPrice: Number(it.product_price ?? 0),
      productQuantity: it.product_quantity,
      notes: it.notes,
    })),
  }
}


async function getRestaurantIdForOrder(orderId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("orders")
    .select("restaurant_id")
    .eq("id", orderId)
    .maybeSingle()
  return data?.restaurant_id ?? null
}


async function getRestaurantIdForTable(tableId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("tables")
    .select("restaurant_id")
    .eq("id", tableId)
    .maybeSingle()
  return data?.restaurant_id ?? null
}



export async function listActiveOrdersForRestaurant(
  restaurantId: number
): Promise<Result<WaiterOrder[]>> {
  const guard = await requireStaffForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, table_id, total, status_id, created_at, ready_at, diner_slot, diner_label, tables(table_number), order_items(id, product_name, variant_name, product_price, product_quantity, notes)"
    )
    .eq("restaurant_id", restaurantId)
    .in("status_id", [ORDER_STATUS_NUEVO, ORDER_STATUS_PREPARANDO, ORDER_STATUS_LISTO, ORDER_STATUS_PAGADO])
    .order("created_at", { ascending: false })

  if (error) return fail("Error al cargar las órdenes")

  return ok((data ?? []).map((row) => mapOrderRow(row as unknown as OrderRow)))
}



export async function advanceOrderStatus(
  orderId: number
): Promise<Result<{ id: number; statusId: number }>> {
  if (!orderId || orderId <= 0) return fail("Orden inválida")

  const restaurantId = await getRestaurantIdForOrder(orderId)
  if (!restaurantId) return fail("Orden no encontrada")

  const guard = await requireStaffForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("id, status_id")
    .eq("id", orderId)
    .maybeSingle()

  if (readError) return fail("Error al leer la orden")
  if (!current) return fail("Orden no encontrada")

  const currentStatus = current.status_id ?? ORDER_STATUS_NUEVO
  if (currentStatus >= ORDER_STATUS_LISTO) {
    return fail("La orden ya está lista")
  }

  const nextStatus = currentStatus + 1

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status_id: nextStatus })
    .eq("id", orderId)
    .select("id, status_id")

  if (updateError) return fail("Error al avanzar la orden")
  if (!updated || updated.length === 0) {
    return fail("No tienes permisos para actualizar esta orden (RLS)")
  }

  return ok({ id: orderId, statusId: nextStatus })
}


export async function markOrderAsPaid(
  orderId: number
): Promise<Result<{ id: number; statusId: number; tableReleased: boolean }>> {
  if (!orderId || orderId <= 0) return fail("Orden inválida")

  const restaurantId = await getRestaurantIdForOrder(orderId)
  if (!restaurantId) return fail("Orden no encontrada")

  const guard = await requireStaffForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("id, status_id, table_id")
    .eq("id", orderId)
    .maybeSingle()

  if (readError) return fail("Error al leer la orden")
  if (!current) return fail("Orden no encontrada")
  if (current.status_id === ORDER_STATUS_PAGADO) {
    return fail("La orden ya está pagada")
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status_id: ORDER_STATUS_PAGADO })
    .eq("id", orderId)

  if (updateError) return fail("Error al marcar la orden como pagada")

  let tableReleased = false
  if (current.table_id) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("table_id", current.table_id)
      .in("status_id", [ORDER_STATUS_NUEVO, ORDER_STATUS_PREPARANDO, ORDER_STATUS_LISTO])

    if ((count ?? 0) === 0) {
      const { error: releaseError } = await supabase
        .from("tables")
        .update({ current_waiter_id: null })
        .eq("id", current.table_id)

      if (!releaseError) tableReleased = true
    }
  }

  return ok({ id: orderId, statusId: ORDER_STATUS_PAGADO, tableReleased })
}




export async function markTableOrdersAsPaid(
  tableId: number,
  tip: number = 0
): Promise<Result<{ tableId: number; paidIds: number[]; tableReleased: boolean }>> {
  if (!tableId || tableId <= 0) return fail("Mesa inválida")

  const restaurantId = await getRestaurantIdForTable(tableId)
  if (!restaurantId) return fail("Mesa no encontrada")

  const guard = await requireStaffForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status_id: ORDER_STATUS_PAGADO })
    .eq("table_id", tableId)
    .in("status_id", [ORDER_STATUS_NUEVO, ORDER_STATUS_PREPARANDO, ORDER_STATUS_LISTO])
    .select("id")

  if (updateError) return fail("Error al marcar las órdenes como pagadas")

  const paidIds = (updated ?? []).map((row) => row.id)

  // Propina (D3): se registra una sola vez por cobro de mesa, en la última
  // orden pagada, para que los reportes de propinas no la cuenten duplicada.
  const tipAmount = Number.isFinite(tip) && tip > 0 ? Math.round(tip) : 0
  if (tipAmount > 0 && paidIds.length > 0) {
    const targetId = Math.max(...paidIds)
    await supabase.from("orders").update({ tip_amount: tipAmount }).eq("id", targetId)
  }

  let tableReleased = false
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .in("status_id", [ORDER_STATUS_NUEVO, ORDER_STATUS_PREPARANDO, ORDER_STATUS_LISTO])

  if ((count ?? 0) === 0) {
    const { error: releaseError } = await supabase
      .from("tables")
      .update({ current_waiter_id: null })
      .eq("id", tableId)

    if (!releaseError) tableReleased = true
  }

  return ok({ tableId, paidIds, tableReleased })
}



// D4: transferir una mesa a otro mesero (o liberar con null). La validación
// de restaurante/mesero vive en la RPC reassign_table (SECURITY DEFINER).
export async function reassignTable(
  tableId: number,
  newWaiterId: number | null
): Promise<Result<{ tableId: number }>> {
  if (!tableId || tableId <= 0) return fail("Mesa inválida")

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.rpc("reassign_table", {
    p_table_id: tableId,
    p_new_waiter_id: newWaiterId,
  })

  if (error) return fail(error.message ?? "No se pudo transferir la mesa")
  return ok({ tableId })
}

/**
 * El mesero reclama una mesa LIBRE desde la app, sin escanear su QR físico.
 * Atómica (RPC waiter_claim_table: UPDATE ... WHERE current_waiter_id IS
 * NULL) — si otro mesero la tomó una fracción de segundo antes, devuelve
 * claimed=false en vez de pisarlo.
 */
export async function claimTable(tableId: number): Promise<Result<{ claimed: boolean }>> {
  if (!tableId || tableId <= 0) return fail("Mesa inválida")

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("waiter_claim_table", { p_table_id: tableId })

  if (error) return fail(error.message ?? "No se pudo tomar la mesa")
  return ok({ claimed: Boolean(data) })
}


export type CreatedOrder = {
  id: number
  statusId: number
  statusName: string | null
  createdAt: string
  tableId: number
  restaurantId: number
  total: number
}


type CreatePublicOrderRpcResult = {
  id: number
  status_id: number
  status_name: string | null
  created_at: string
  table_id: number
  restaurant_id: number
  total: number
}

export async function createOrder(input: CreateOrderInput): Promise<Result<CreatedOrder>> {

  // productos/variantes y recalcula el total.

  const validation = CreateOrderSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { qrToken, items, dinerToken, couponCode } = validation.data

  // Construir el array jsonb que espera la RPC (snake_case). Una línea es un
  // producto (product_id) o una promoción (promotion_id). Las promos "build"
  // llevan además las elecciones del comensal (selections).
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

  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc("create_public_order_qr", {
    p_qr_token: qrToken,
    p_items: rpcItems,
    p_diner_token: dinerToken ?? null,
    p_coupon_code: couponCode ?? null,
  })

if (error) {
    if (error.message?.includes("rate_limit_exceeded")) {
      return fail("Estás haciendo pedidos demasiado rápido. Espera un momento e intenta de nuevo.")
    }
    return fail(error.message ?? "Error al crear el pedido")
  }

  const result = data as CreatePublicOrderRpcResult | null
  if (!result || !result.id) {
    return fail("Error al crear el pedido")
  }

  // El pedido descontó stock por receta: refrescar el menú cacheado para que el
  // "agotado" se refleje en las próximas cargas (no hay realtime en el menú).
  try {
    revalidateTag(menuTag(result.restaurant_id), "max")
  } catch {
    // fuera de contexto de revalidación: ignorar
  }

  return ok({
    id: result.id,
    statusId: result.status_id,
    statusName: result.status_name,
    createdAt: result.created_at,
    tableId: result.table_id,
    restaurantId: result.restaurant_id,
    total: result.total,
  })
}