"use client"

import { BackButton } from "@/components/ui/BackButton"
import { useOrderList } from "@/hooks/useOrderList"

const statusStyles: Record<string, string> = {
  Nuevo: "bg-orange-100 text-orange-700",
  Preparación: "bg-amber-100 text-amber-700",
  Listo: "bg-emerald-100 text-emerald-700",
  Entregado: "bg-stone-100 text-stone-600",
  Cancelado: "bg-red-100 text-red-700",
}

function formatTime(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  if (diff < 60) return "Hace menos de 1 min"
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  return `Hace ${Math.floor(diff / 3600)} h`
}

export default function OrdersPage() {
  const { orders, activeOrdersCount, loading, error } = useOrderList()

  const summary = [
    {
      label: "Nuevos",
      value: orders.filter((o) => o.status_id === 1).length,
      className: "bg-orange-50 text-orange-700 ring-orange-100",
    },
    {
      label: "En preparación",
      value: orders.filter((o) => o.status_id === 2).length,
      className: "bg-amber-50 text-amber-700 ring-amber-100",
    },
    {
      label: "Listos",
      value: orders.filter((o) => o.status_id === 3).length,
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    },
  ]

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <BackButton
            href="/admin"
            label="Volver"
            className="mb-4 inline-flex rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 hover:shadow-md"
          />
          <p className="text-sm text-stone-600">Panel admin</p>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
            Gestiona los pedidos activos del restaurante.
          </p>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          {summary.map((item) => (
            <div key={item.label} className={`rounded-3xl px-5 py-4 ring-1 ${item.className}`}>
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-xl shadow-stone-900/5 sm:p-6">
          {loading && (
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-sm text-stone-600 shadow-inner">
              Cargando pedidos...
            </div>
          )}

          {error && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-600 shadow-sm">
              {error}
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center shadow-inner">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                #
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight">
                No hay pedidos activos
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-600">
                Cuando entren nuevos pedidos aparecerán en este panel.
              </p>
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => {
                const statusName = order.order_status?.status_name ?? "Desconocido"
                const tableName = `Mesa ${order.tables?.[0]?.table_number ?? order.table_id}`

                return (
                  <article
                    key={order.id}
                    className="flex min-w-0 flex-col rounded-3xl border border-stone-200 bg-white p-5 shadow-lg shadow-stone-900/5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-xl font-bold tracking-tight text-stone-950 tabular-nums">
                          Pedido #{order.id}
                        </h2>
                        <p className="mt-2 text-base font-semibold text-stone-700">
                          {tableName}
                        </p>
                        <p className="mt-1 text-sm font-medium text-stone-500 tabular-nums">
                          {formatTime(order.created_at)}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyles[statusName] ?? "bg-stone-100 text-stone-600"}`}
                      >
                        {statusName}
                      </span>
                    </div>

                    <div className="mb-5 rounded-3xl bg-orange-50 px-4 py-3 ring-1 ring-orange-100">
                      <p className="text-sm font-semibold text-orange-700">Total</p>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-orange-700 tabular-nums">
                        ${order.total.toLocaleString("es-CL")}
                      </p>
                    </div>

                    <div className="mt-auto">
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
