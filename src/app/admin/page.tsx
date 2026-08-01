"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useTableList } from "@/hooks/useTableList"
import { useOrderList } from "@/hooks/useOrderList"
import { useOrderStats } from "@/hooks/useOrderStats"
import { InventoryAlertCard } from "@/components/admin/InventoryAlertCard"
import { Sparkline } from "@/components/admin/Sparkline"
import { getSalesReport, type TimeBucket } from "@/services/report-service"

function todayHourRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from: from.toISOString(), to: to.toISOString(), granularity: "hour" as const }
}

const statusConfig: Record<string, string> = {
  "Nuevo":          "bg-orange-50 text-orange-700 ring-orange-200/50",
  "En preparación": "bg-stone-950 text-white ring-stone-900/50",
  "Listo":          "bg-emerald-50 text-emerald-700 ring-emerald-200/50",
}

export default function AdminPage() {
  const { totalTables, loading: loadingTables } = useTableList()
  const { orders, activeOrdersCount, loading: loadingOrders } = useOrderList({ limit: 4 })
  const { dailySales, completedOrders, loading: loadingStats } = useOrderStats()

  const [todayTimeline, setTodayTimeline] = useState<TimeBucket[]>([])

  useEffect(() => {
    let active = true
    getSalesReport(todayHourRange()).then((res) => {
      if (active && res.ok) setTodayTimeline(res.data.timeline)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">

      {/* Aviso de inventario crítico (solo si hay insumos sin/bajo stock) */}
      <InventoryAlertCard />

      {/* Sección principal de métricas de ventas */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Ventas del día</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-stone-900 tabular-nums">
                {loadingStats ? "..." : `$${dailySales.toLocaleString("es-CL")}`}
              </p>
            </div>
            {todayTimeline.length >= 2 && (
              <div className="hidden flex-1 sm:block">
                <Sparkline
                  id="dashboard-sales"
                  data={todayTimeline}
                  dataKey="revenue"
                  color="#1c1917"
                  formatValue={(n) => `$${n.toLocaleString("es-CL")}`}
                  height={48}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-orange-50 px-4 py-3 ring-1 ring-orange-200/50">
            <div className="sm:text-right">
              <p className="text-xs font-semibold text-orange-800">pedidos cerrados</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-orange-700 tabular-nums">
                {loadingStats ? "..." : completedOrders}
              </p>
            </div>
            {todayTimeline.length >= 2 && (
              <div className="hidden w-24 sm:block">
                <Sparkline
                  id="dashboard-orders"
                  data={todayTimeline}
                  dataKey="orderCount"
                  color="#ea580c"
                  formatValue={(n) => `${n} pedido${n === 1 ? "" : "s"}`}
                  height={40}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Cartas rápidas operacionales */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/orders"
          className="group rounded-3xl bg-orange-500 p-6 text-white shadow-xl shadow-orange-500/10 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/25"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-orange-100 uppercase tracking-wider">Pedidos activos</p>
            <span className="text-lg">▣</span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight tabular-nums">
            {loadingOrders ? "..." : activeOrdersCount}
          </p>
          <p className="mt-2 text-xs font-medium text-orange-100 transition group-hover:text-white">
            Ver panel de comandas en preparación →
          </p>
        </Link>

        <Link
          href="/admin/tables"
          className="group rounded-3xl border border-stone-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Mesas totales</p>
            <span className="text-lg text-stone-400 group-hover:text-orange-500 transition">◫</span>
          </div>
          <p className="mt-4 text-5xl font-extrabold tracking-tight text-stone-900 tabular-nums">
            {loadingTables ? "..." : totalTables}
          </p>
          <p className="mt-2 text-xs font-medium text-stone-500 group-hover:text-orange-600 transition">
            Ver códigos QR y estados de mesa →
          </p>
        </Link>
      </section>

      {/* Listado de pedidos activos recientes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pedidos Recientes</h3>
          <Link href="/admin/orders" className="text-xs font-bold text-orange-600 hover:text-orange-700">
            Ver todos
          </Link>
        </div>

        {loadingOrders ? (
          <p className="py-8 text-center text-xs font-medium text-stone-500 animate-pulse">Cargando pedidos...</p>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-200 bg-white p-8 text-center shadow-inner">
            <p className="text-xs font-semibold text-stone-500">No hay pedidos activos en este momento.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {orders.map((order) => {
              const statusName = order.order_status?.status_name ?? ""
              const badgeClass = statusConfig[statusName] ?? "bg-stone-100 text-stone-700"
              const tablesData = order.tables as
                | { table_number: number | null }
                | { table_number: number | null }[]
                | null
                | undefined
              const tableNumber = Array.isArray(tablesData)
                ? tablesData[0]?.table_number
                : tablesData?.table_number

              return (
                <Link
                  key={order.id}
                  href="/admin/orders"
                  className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-stone-900">
                        {order.order_type === "delivery"
                          ? `${order.fulfillment_type === "pickup" ? "Retiro en tienda" : "Domicilio"}${order.delivery_customer_name ? ` · ${order.delivery_customer_name}` : ""}`
                          : tableNumber === 0
                            ? "Recepción"
                            : `Mesa ${tableNumber ?? order.table_id ?? "—"}`}
                      </h4>
                      <p className="mt-1 text-xs font-medium text-stone-500 tabular-nums">
                        Pedido #{order.id} · ${order.total.toLocaleString("es-CL")}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ring-1 ring-stone-950/5 ${badgeClass}`}>
                      {statusName}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
