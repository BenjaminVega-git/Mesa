"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"

const statusStyles: Record<string, string> = {
  Nuevo: "bg-orange-50 text-orange-700 ring-orange-200",
  Preparación: "bg-amber-50 text-amber-700 ring-amber-200",
  Listo: "bg-emerald-50 text-emerald-700 ring-emerald-600",
  Pagado: "bg-stone-100 text-stone-700 ring-stone-200",
  Cancelado: "bg-red-50 text-red-700 ring-red-200",
}

type OrderDetail = {
  id: number
  order_number: number | null
  total: number
  table_id: number | null
  status_id: number | null
  created_at: string
  ready_at: string | null
  diner_slot: number | null
  diner_label: string | null
  table_number: number | null
  status_name: string | null
  items: {
    id: number
    product_name: string | null
    variant_name: string | null
    product_price: number
    product_quantity: number
    notes: string | null
  }[]
}

type Props = {
  orderId: number | null
  onClose: () => void
}

function formatPrice(n: number) {
  return `$${n.toLocaleString("es-CL")}`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function OrderDetailModal({ orderId, onClose }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cerrar/cambiar de orden
      setOrder(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data, error: e } = await supabase
        .from("orders")
        .select(
          "id, order_number, total, table_id, status_id, created_at, ready_at, diner_slot, diner_label, tables(table_number), order_status(status_name), order_items(id, product_name, variant_name, product_price, product_quantity, notes)"
        )
        .eq("id", orderId)
        .maybeSingle()

      if (cancelled) return
      if (e || !data) {
        logger.error("Error cargando detalle de pedido", { error: e?.message })
        setError("No se pudo cargar el detalle.")
        setLoading(false)
        return
      }

      const tablesRel = data.tables as
        | { table_number: number | null }
        | { table_number: number | null }[]
        | null
      const statusRel = data.order_status as
        | { status_name: string | null }
        | { status_name: string | null }[]
        | null
      const tableNumber = Array.isArray(tablesRel)
        ? tablesRel[0]?.table_number ?? null
        : tablesRel?.table_number ?? null
      const statusName = Array.isArray(statusRel)
        ? statusRel[0]?.status_name ?? null
        : statusRel?.status_name ?? null

      const items = (data.order_items ?? []) as OrderDetail["items"]

      setOrder({
        id: data.id,
        order_number: data.order_number,
        total: data.total ?? 0,
        table_id: data.table_id,
        status_id: data.status_id,
        created_at: data.created_at,
        ready_at: data.ready_at,
        diner_slot: data.diner_slot,
        diner_label: data.diner_label,
        table_number: tableNumber,
        status_name: statusName,
        items,
      })
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [orderId])

  if (!orderId) return null

  const statusBadge = order?.status_name
    ? statusStyles[order.status_name] ?? "bg-stone-100 text-stone-700 ring-stone-200"
    : "bg-stone-100 text-stone-500 ring-stone-200"

  const tableLabel = order
    ? order.table_number != null
      ? `Mesa ${order.table_number}`
      : order.table_id != null
        ? `Mesa #${order.table_id}`
        : "Sin mesa"
    : ""

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <section
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
              Detalle del pedido
            </p>
            {order ? (
              <>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-stone-950 tabular-nums">
                  Pedido #{order.order_number ?? order.id}
                </h2>
                <p className="mt-1 text-sm font-semibold text-stone-700">
                  {tableLabel}
                  {order.diner_label ? (
                    <span className="ml-1 text-stone-500">· {order.diner_label}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-stone-500 tabular-nums">
                  {formatDateTime(order.created_at)}
                </p>
              </>
            ) : (
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-stone-950">
                Pedido #{orderId}
              </h2>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {order?.status_name && (
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${statusBadge}`}>
                {order.status_name}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <p className="py-10 text-center text-sm font-semibold text-stone-500 animate-pulse">
              Cargando…
            </p>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
              {error}
            </div>
          )}

          {order && !loading && !error && (
            <>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                Productos ({order.items.length})
              </p>

              {order.items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 py-6 text-center text-xs font-semibold text-stone-500">
                  Este pedido no tiene ítems.
                </p>
              ) : (
                <ul className="space-y-2">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3"
                    >
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-[11px] font-extrabold text-orange-700 tabular-nums">
                          {item.product_quantity}×
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-stone-900">
                            {item.product_name ?? "Producto"}
                            {item.variant_name ? (
                              <span className="ml-1 font-semibold text-stone-600">
                                · {item.variant_name}
                              </span>
                            ) : null}
                          </p>
                          {item.notes && (
                            <p className="mt-0.5 text-[11px] italic text-orange-700">
                              📝 {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-stone-700 tabular-nums">
                        {formatPrice(item.product_price * item.product_quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {order && (
          <footer className="border-t border-stone-100 bg-stone-50 px-6 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Total</span>
              <span className="text-2xl font-extrabold tracking-tight text-orange-700 tabular-nums">
                {formatPrice(order.total)}
              </span>
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
