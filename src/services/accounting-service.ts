"use server"

// Lecturas para el módulo CONTABILIDAD del mesero: historial de pedidos
// tomados y de todas las boletas emitidas por el sistema (no solo hoy, a
// diferencia de listPaymentsToday). Solo lectura — no se cobra ni se abre o
// cierra turno desde aquí (eso vive en /admin/caja).

import { requireCurrentStaff } from "@/services/auth-guard"
import { ok, fail, type Result } from "@/services/result"
import type { BoletaInfo } from "@/services/charge-service"

export type OrderHistoryRow = {
  id: number
  tableNumber: number | null
  total: number
  tipAmount: number
  statusId: number
  statusName: string | null
  createdAt: string
  paidByName: string | null
  items: Array<{ productName: string; variantName: string | null; quantity: number }>
}

export async function listOrdersHistory(limit = 100): Promise<Result<OrderHistoryRow[]>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("list_my_orders_history", { p_limit: limit })
  if (error) return fail("No se pudo cargar el historial de pedidos")

  type Row = {
    id: number
    table_number: number | null
    total: number
    tip_amount: number
    status_id: number
    status_name: string | null
    created_at: string
    paid_by_name: string | null
    items: Array<{ product_name: string; variant_name: string | null; quantity: number }>
  }
  const rows = (data ?? []) as Row[]
  return ok(
    rows.map((r) => ({
      id: r.id,
      tableNumber: r.table_number,
      total: Number(r.total ?? 0),
      tipAmount: Number(r.tip_amount ?? 0),
      statusId: r.status_id,
      statusName: r.status_name,
      createdAt: r.created_at,
      paidByName: r.paid_by_name,
      items: (r.items ?? []).map((it) => ({
        productName: it.product_name,
        variantName: it.variant_name,
        quantity: it.quantity,
      })),
    }))
  )
}

export type PaymentHistoryRow = {
  id: number
  status: string
  method: string
  provider: string | null
  amount: number
  tip: number
  tableNumber: number | null
  createdAt: string
  paidAt: string | null
  boleta: BoletaInfo | null
}

export async function listPaymentsHistory(limit = 100): Promise<Result<PaymentHistoryRow[]>> {
  const auth = await requireCurrentStaff()
  if (!auth.ok) return fail(auth.error)
  const { supabase } = auth.data

  const { data, error } = await supabase.rpc("list_my_payments_history", { p_limit: limit })
  if (error) return fail("No se pudo cargar el historial de pagos")

  type Row = {
    id: number
    table_number: number | null
    amount: number
    tip: number
    status: string
    method: string
    provider: string | null
    created_at: string
    paid_at: string | null
    boleta: { id: number; folio: number | null; sii_status: string } | null
  }
  const rows = (data ?? []) as Row[]
  return ok(
    rows.map((r) => ({
      id: Number(r.id),
      status: String(r.status),
      method: String(r.method),
      provider: r.provider ?? null,
      amount: Number(r.amount ?? 0),
      tip: Number(r.tip ?? 0),
      tableNumber: r.table_number != null ? Number(r.table_number) : null,
      createdAt: r.created_at,
      paidAt: r.paid_at ?? null,
      boleta: r.boleta
        ? {
            id: Number(r.boleta.id),
            folio: r.boleta.folio != null ? Number(r.boleta.folio) : null,
            siiStatus: String(r.boleta.sii_status ?? "pending"),
          }
        : null,
    }))
  )
}
