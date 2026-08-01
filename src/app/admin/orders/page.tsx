"use client"

import { useState } from "react"
import { Barcode } from "lucide-react"
import { useOrderList } from "@/hooks/useOrderList"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"
import { OrderDetailModal } from "@/components/admin/OrderDetailModal"
import { AdminChargeSection } from "@/components/admin/AdminChargeSection"
import { PaymentsTodaySection } from "@/components/charge/PaymentsTodaySection"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { cancelOrderAction } from "@/app/actions/order-actions"
import type { Order } from "@/types/order"

const statusStyles: Record<string, string> = {
  Nuevo: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/50",
  Preparacion: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/50",
  "Preparación": "bg-amber-50 text-amber-700 ring-1 ring-amber-200/50",
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

function orderPlaceLabel(order: Order) {
  const tableNumber = order.tables?.[0]?.table_number

  if (order.order_type === "delivery") {
    const mode = order.fulfillment_type === "pickup" ? "Retiro en tienda" : "Domicilio"
    return `${mode}${order.delivery_customer_name ? ` · ${order.delivery_customer_name}` : ""}`
  }

  if (tableNumber === 0) return "Recepción"
  return `Mesa ${tableNumber ?? order.table_id ?? "—"}`
}

function OrdersGrid({
  orders,
  emptyTitle,
  emptyDescription,
  onSelect,
  onCancel,
}: {
  orders: Order[]
  emptyTitle: string
  emptyDescription: string
  onSelect: (id: number) => void
  onCancel: (target: { id: number; label: string }) => void
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl text-stone-400 shadow-sm">
          #
        </div>
        <h3 className="mt-4 font-bold text-stone-900">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-stone-550">
          {emptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((order) => {
        const statusName = order.order_status?.status_name ?? "Desconocido"
        const orderLabel = `Pedido #${order.order_number ?? order.id}`

        return (
          <article
            key={order.id}
            className="flex min-w-0 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-250 hover:shadow-md"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold tracking-tight text-stone-900 tabular-nums">
                  {orderLabel}
                </h3>
                <p className="mt-1 text-sm font-semibold text-stone-700">
                  {orderPlaceLabel(order)}
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
                onClick={() => onSelect(order.id)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100"
              >
                Ver detalle
              </button>
              <button
                type="button"
                onClick={() => onCancel({ id: order.id, label: orderLabel })}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
              >
                Cancelar
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default function OrdersPage() {
  const { orders, loading, error } = useOrderList()
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{ id: number; label: string } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [scanNotice, setScanNotice] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  const tableOrders = orders.filter((order) => order.order_type !== "delivery")
  const onlineOrders = orders.filter((order) => order.order_type === "delivery")

  useBarcodeScanner({
    enabled: selectedOrderId === null && cancelTarget === null,
    onScan: (code) => {
      const numericPart = code.match(/\d+/g)?.join("") ?? ""
      const scannedNumber = Number(numericPart || code)

      if (!Number.isFinite(scannedNumber) || scannedNumber <= 0) {
        setScanNotice({ kind: "error", message: `No pude leer un numero de pedido desde "${code}".` })
        return
      }

      const match = orders.find((order) => order.order_number === scannedNumber)
        ?? orders.find((order) => order.id === scannedNumber)

      if (!match) {
        setScanNotice({ kind: "error", message: `No encontre un pedido activo para el codigo ${code}.` })
        return
      }

      setSelectedOrderId(match.id)
      setScanNotice({ kind: "ok", message: `Pedido #${match.order_number ?? match.id} abierto desde escaner.` })
    },
  })

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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">Panel de Pedidos</h2>
          <p className="text-sm text-stone-600">
            Monitoreo, despacho y cobro de las comandas activas.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-semibold text-stone-600 shadow-sm">
        <Barcode className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
        <span>
          Escanea un numero de pedido para abrir su detalle.
        </span>
      </div>

      {scanNotice && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold shadow-sm ${
            scanNotice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {scanNotice.message}
        </div>
      )}

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

      <AdminChargeSection orders={orders} />

      <section className="space-y-6 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        {loading && (
          <div className="animate-pulse rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center text-xs font-semibold text-stone-500">
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

        {!loading && !error && (
          <>
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold tracking-tight text-stone-900">Pedidos de mesas</h3>
                  <p className="text-xs font-semibold text-stone-500">Comandas hechas desde QR, recepción o atención en mesa.</p>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600">
                  {tableOrders.length}
                </span>
              </div>
              <OrdersGrid
                orders={tableOrders}
                emptyTitle="No hay pedidos de mesas"
                emptyDescription="Cuando los clientes pidan desde una mesa o recepción aparecerán aquí."
                onSelect={setSelectedOrderId}
                onCancel={setCancelTarget}
              />
            </div>

            <div className="border-t border-stone-200 pt-6">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold tracking-tight text-stone-900">Pedidos online</h3>
                  <p className="text-xs font-semibold text-stone-500">Pedidos para domicilio o retiro en tienda.</p>
                </div>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 ring-1 ring-orange-200/60">
                  {onlineOrders.length}
                </span>
              </div>
              <OrdersGrid
                orders={onlineOrders}
                emptyTitle="No hay pedidos online"
                emptyDescription="Los pedidos de delivery o retiro se mostrarán separados en este apartado."
                onSelect={setSelectedOrderId}
                onCancel={setCancelTarget}
              />
            </div>
          </>
        )}
      </section>

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
