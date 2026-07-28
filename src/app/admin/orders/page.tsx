"use client"

import { useState } from "react"
import { useOrderList } from "@/hooks/useOrderList"
import { OrderDetailModal } from "@/components/admin/OrderDetailModal"
import { AdminChargeSection } from "@/components/admin/AdminChargeSection"
import { PaymentsTodaySection } from "@/components/charge/PaymentsTodaySection"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { cancelOrderAction } from "@/app/actions/order-actions"

const statusStyles: Record<string, string> = {
  Nuevo: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/50",
  Preparación: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/50",
  Listo: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/50",
  Pagado: "bg-stone-50 text-stone-600 ring-1 ring-stone-200/50",
  Cancelado: "bg-red-50 text-red-700 ring-1 ring-red-200/50",
}

function formatTime(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (diff < 60) return "Hace menos de 1 min"
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  return `Hace ${Math.floor(diff / 3600)} h`
}

export default function OrdersPage() {
  const { orders, loading, error } = useOrderList()
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: number; label: string } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function handleConfirmCancel() {
    if (!cancelTarget || cancelling) return
    setCancelling(true)
    setCancelError(null)
    const result = await cancelOrderAction(cancelTarget.id, "Cancelado por error desde el panel")
    setCancelling(false)
    if (!result.ok) {
      setCancelError(result.error)
      return
    }
    // El cambio de status_id llega por realtime (mismo canal que ya refresca
    // la lista al avanzar/pagar pedidos) — no hace falta refetch manual.
    setCancelTarget(null)
  }

  const summary = [
    {
      label: "Nuevos",
      value: orders.filter((o) => o.status_id === 1).length,
      className: "bg-orange-50 text-orange-750 ring-orange-255/40",
    },
    {
      label: "En preparación",
      value: orders.filter((o) => o.status_id === 2).length,
      className: "bg-amber-50 text-amber-750 ring-amber-255/40",
    },
    {
      label: "Listos",
      value: orders.filter((o) => o.status_id === 3).length,
      className: "bg-emerald-50 text-emerald-750 ring-emerald-255/40",
    },
  ]

  return (
    <div className="space-y-6">
      
      {/* Encabezado de página local minimalista */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">Panel de Pedidos</h2>
          <p className="text-sm text-stone-600">
            Monitoreo, despacho y cobro de las comandas activas.
          </p>
        </div>
      </div>

      {/* Resumen de estados rápidos */}
      <section className="grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <div key={item.label} className={`rounded-2xl px-5 py-4 ring-1 ${item.className} bg-white shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">{item.label}</p>
            <p className="mt-2 text-3xl font-extrabold leading-none tracking-tight tabular-nums">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      {/* Cobro por mesa (pasarela conectada, efectivo o tarjeta) */}
      <AdminChargeSection orders={orders} />

      {/* Panel principal de comandas */}
      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        {loading && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-500 animate-pulse">
            Cargando pedidos activos...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-xs font-bold text-red-650 shadow-sm">
            {error}
          </div>
        )}

        {cancelError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 shadow-sm">
            {cancelError}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl shadow-sm text-stone-400">
              #
            </div>
            <h3 className="mt-4 font-bold text-stone-900">No hay pedidos activos</h3>
            <p className="mx-auto mt-2 max-w-xs text-xs text-stone-550 leading-relaxed">
              Cuando los clientes realicen pedidos desde sus mesas aparecerán en esta sección automáticamente.
            </p>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const statusName = order.order_status?.status_name ?? "Desconocido"
              const tablesData = order.tables as
                | { table_number: number | null }
                | { table_number: number | null }[]
                | null
                | undefined
              const tableNumber = Array.isArray(tablesData)
                ? tablesData[0]?.table_number
                : tablesData?.table_number
              const tableName = `Mesa ${tableNumber ?? order.table_id}`

              return (
                <article
                  key={order.id}
                  className="flex min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-250 hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold tracking-tight text-stone-900 tabular-nums">
                        Pedido #{order.order_number ?? order.id}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-stone-700">
                        {tableName}
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold text-stone-500 tabular-nums">
                        {formatTime(order.created_at)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        statusStyles[statusName] ?? "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {statusName}
                    </span>
                  </div>

                  <div className="mb-4 rounded-2xl bg-orange-50 px-4 py-2.5 ring-1 ring-orange-200/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-850">Total</p>
                    <p className="mt-0.5 text-xl font-extrabold tracking-tight text-orange-700 tabular-nums">
                      ${order.total.toLocaleString("es-CL")}
                    </p>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
                    >
                      Ver detalle
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget({ id: order.id, label: `Pedido #${order.order_number ?? order.id}` })}
                      className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Pagos del día con su boleta (todos los métodos) */}
      <PaymentsTodaySection />

      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title={`¿Cancelar ${cancelTarget?.label ?? "este pedido"}?`}
        description="Se marca como cancelado y ya no cuenta en los reportes de ventas. Si había descontado insumos del inventario, se le devuelven automáticamente. Esta acción no se puede deshacer."
        confirmLabel={cancelling ? "Cancelando..." : "Sí, cancelar pedido"}
        cancelLabel="No, mantener pedido"
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          if (!cancelling) setCancelTarget(null)
        }}
      />

    </div>
  )
}
