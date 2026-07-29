import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  CreateTableSchema,
  UpdateTableSchema,
  DeleteTableSchema,
  type CreateTableInput,
  type UpdateTableInput,
  type DeleteTableInput,
} from "@/lib/validation/table"
import { ok, fail, type Result } from "@/services/result"
import { createTableQR, deleteTableQR } from "@/services/qr-service"
import { requireAdminForRestaurant } from "@/services/auth-guard"

export type CreatedTable = {
  id: number
}

export type TableForEdit = {
  id: number
  tableNumber: number
  qrCodeId: number
}

export type ResetTableResult = {
  tableId: number
  canceledIds: number[]
  stockReversals: number
}

/**
 * Lee restaurant_id de una mesa. Helper interno para validar permisos
 * cuando la action recibe solo tableId (update/delete/read).
 */
async function getRestaurantIdForTable(tableId: number): Promise<number | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("tables")
    .select("restaurant_id")
    .eq("id", tableId)
    .maybeSingle()
  return data?.restaurant_id ?? null
}

// ============ READ (admin) ============

export async function getTableForEdit(tableId: number): Promise<Result<TableForEdit>> {
  if (!tableId || tableId <= 0) {
    return fail("Mesa no encontrada")
  }

  const restaurantId = await getRestaurantIdForTable(tableId)
  if (!restaurantId) return fail("Mesa no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase
    .from("tables")
    .select("id, table_number, qr_code_id")
    .eq("id", tableId)
    .maybeSingle()

  if (error) return fail("Error al cargar mesa")
  if (!data) return fail("Mesa no encontrada")

  return ok({
    id: data.id,
    tableNumber: data.table_number,
    qrCodeId: data.qr_code_id,
  })
}

// ============ CREATE (admin) ============

export async function createTable(input: CreateTableInput): Promise<Result<CreatedTable>> {
  const validation = CreateTableSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { tableNumber, restaurantId } = validation.data

  // Verificar permisos ANTES de crear el QR para evitar dejar QRs huérfanos
  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const qrResult = await createTableQR()

  if (!qrResult.ok) {
    return fail(qrResult.error)
  }

  const { data, error } = await supabase
    .from("tables")
    .insert({
      table_number: tableNumber,
      restaurant_id: restaurantId,
      qr_code_id: qrResult.data.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    await deleteTableQR(qrResult.data.id)
    return fail("Error al crear la mesa")
  }

  return ok({ id: data.id })
}

// ============ UPDATE (admin) ============

export async function updateTable(input: UpdateTableInput): Promise<Result<{ id: number }>> {
  const validation = UpdateTableSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { tableId, tableNumber } = validation.data

  const restaurantId = await getRestaurantIdForTable(tableId)
  if (!restaurantId) return fail("Mesa no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { error } = await supabase
    .from("tables")
    .update({ table_number: tableNumber })
    .eq("id", tableId)

  if (error) {
    return fail("Error al actualizar la mesa")
  }

  return ok({ id: tableId })
}

// ============ DELETE (admin) ============

export async function deleteTable(input: DeleteTableInput): Promise<Result<{ id: number }>> {
  const validation = DeleteTableSchema.safeParse(input)

  if (!validation.success) {
    return fail(validation.error.issues[0]?.message ?? "Datos inválidos")
  }

  const { tableId, qrCodeId } = validation.data

  const restaurantId = await getRestaurantIdForTable(tableId)
  if (!restaurantId) return fail("Mesa no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { error: tableError } = await supabase
    .from("tables")
    .delete()
    .eq("id", tableId)

  if (tableError) {
    return fail("Error al eliminar la mesa")
  }

  const qrResult = await deleteTableQR(qrCodeId)

  if (!qrResult.ok) {
    return ok({ id: tableId })
  }

  return ok({ id: tableId })
}

// ============ RESET (admin) ============

export async function resetTable(
  tableId: number,
  reason?: string
): Promise<Result<ResetTableResult>> {
  if (!tableId || tableId <= 0) return fail("Mesa no encontrada")

  const restaurantId = await getRestaurantIdForTable(tableId)
  if (!restaurantId) return fail("Mesa no encontrada")

  const guard = await requireAdminForRestaurant(restaurantId)
  if (!guard.ok) return fail(guard.error)
  const { supabase } = guard.data

  const { data, error } = await supabase.rpc("admin_reset_table", {
    p_table_id: tableId,
    p_reason: reason?.trim() || null,
  })

  if (error) return fail(error.message ?? "No se pudo resetear la mesa")

  const result = data as {
    ok?: boolean
    table_id?: number
    canceled_ids?: number[]
    stock_reversals?: number
  } | null

  if (!result?.ok || !result.table_id) return fail("No se pudo resetear la mesa")

  return ok({
    tableId: Number(result.table_id),
    canceledIds: (result.canceled_ids ?? []).map(Number),
    stockReversals: Number(result.stock_reversals ?? 0),
  })
}
