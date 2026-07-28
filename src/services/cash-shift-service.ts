"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ok, fail, type Result } from "@/services/result"

export type CurrentShift = {
  id: number
  openedAt: string
  openedByName: string | null
  openingAmount: number
  sales: number
  tips: number
  orders: number
  /** Desglose por método (incluye propinas de cada vía). */
  salesCash: number
  salesCard: number
  salesOnline: number
  /** Efectivo que debería haber en el cajón: apertura + cobros en efectivo. */
  expectedCash: number
}

type CurrentShiftRpcResult = {
  id: number
  opened_at: string
  opened_by_name: string | null
  opening_amount: number
  sales: number
  tips: number
  orders: number
  sales_cash: number
  sales_card: number
  sales_online: number
  expected_cash: number
} | null

type CloseShiftRpcResult = {
  id: number
  expected: number
  closing: number
  cash_sales: number
  card_sales: number
  online_sales: number
  closed_by_name: string | null
}

export type PastShift = {
  id: number
  openedAt: string
  closedAt: string
  openedByName: string | null
  closedByName: string | null
  openingAmount: number
  closingAmount: number
  cashSales: number
  cardSales: number
  onlineSales: number
  tips: number
  ordersCount: number
  expectedCash: number
  difference: number
  notes: string | null
}

type PastShiftRpcResult = {
  id: number
  opened_at: string
  closed_at: string
  opened_by_name: string | null
  closed_by_name: string | null
  opening_amount: number
  closing_amount: number
  cash_sales: number | null
  card_sales: number | null
  online_sales: number | null
  tips: number | null
  orders_count: number | null
  expected_cash: number
  difference: number
  notes: string | null
}

export async function getCurrentShift(): Promise<Result<CurrentShift | null>> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("get_current_cash_shift")

  if (error) return fail(error.message ?? "No se pudo obtener el turno actual")

  const result = data as CurrentShiftRpcResult
  if (!result || result.id == null) return ok(null)

  return ok({
    id: result.id,
    openedAt: result.opened_at,
    openedByName: result.opened_by_name ?? null,
    openingAmount: result.opening_amount ?? 0,
    sales: result.sales ?? 0,
    tips: result.tips ?? 0,
    orders: result.orders ?? 0,
    salesCash: result.sales_cash ?? 0,
    salesCard: result.sales_card ?? 0,
    salesOnline: result.sales_online ?? 0,
    expectedCash: result.expected_cash ?? result.opening_amount ?? 0,
  })
}

export async function openShift(opening: number): Promise<Result<{ id: number }>> {
  if (!Number.isFinite(opening) || opening < 0) return fail("Monto inicial inválido")

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("open_cash_shift", {
    p_opening: Math.round(opening),
  })

  if (error) return fail(error.message ?? "No se pudo abrir el turno")

  const id = data as number | null
  if (id == null) return fail("No se pudo abrir el turno")

  return ok({ id })
}

export type CloseShiftResult = {
  id: number
  expected: number
  closing: number
  cashSales: number
  cardSales: number
  onlineSales: number
  closedByName: string | null
}

export async function closeShift(
  closing: number,
  notes: string
): Promise<Result<CloseShiftResult>> {
  if (!Number.isFinite(closing) || closing < 0) return fail("Monto contado inválido")

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("close_cash_shift", {
    p_closing: Math.round(closing),
    p_notes: notes ?? "",
  })

  if (error) return fail(error.message ?? "No se pudo cerrar el turno")

  const result = data as CloseShiftRpcResult | null
  if (!result || result.id == null) return fail("No se pudo cerrar el turno")

  return ok({
    id: result.id,
    expected: result.expected ?? 0,
    closing: result.closing ?? 0,
    cashSales: result.cash_sales ?? 0,
    cardSales: result.card_sales ?? 0,
    onlineSales: result.online_sales ?? 0,
    closedByName: result.closed_by_name ?? null,
  })
}

export async function listPastShifts(limit = 20): Promise<Result<PastShift[]>> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("list_cash_shifts", { p_limit: limit })

  if (error) return fail(error.message ?? "No se pudo obtener el historial de caja")

  const results = (data ?? []) as PastShiftRpcResult[]
  return ok(
    results.map((r) => ({
      id: r.id,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      openedByName: r.opened_by_name ?? null,
      closedByName: r.closed_by_name ?? null,
      openingAmount: r.opening_amount ?? 0,
      closingAmount: r.closing_amount ?? 0,
      cashSales: r.cash_sales ?? 0,
      cardSales: r.card_sales ?? 0,
      onlineSales: r.online_sales ?? 0,
      tips: r.tips ?? 0,
      ordersCount: r.orders_count ?? 0,
      expectedCash: r.expected_cash ?? 0,
      difference: r.difference ?? 0,
      notes: r.notes ?? null,
    }))
  )
}
