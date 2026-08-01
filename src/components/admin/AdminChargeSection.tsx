"use client"

import { useMemo, useState } from "react"
import type { Order } from "@/types/order"
import { ChargeDialog, type ChargeTarget } from "@/components/charge/ChargeDialog"
import { useGatewayProvider } from "@/hooks/useGatewayProvider"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

type TableGroup = {
  tableId: number
  label: string
  ordersCount: number
  total: number
  unreadyCount: number
}

/**
 * COBRO desde el panel admin: agrupa los pedidos activos por mesa y abre el
 * mismo ChargeDialog del mesero (efectivo / tarjeta / QR de pasarela), con
 * registro en payments y boleta automática. La lista se refresca sola: el
 * hook de pedidos del admin escucha los cambios por realtime.
 */
export function AdminChargeSection({ orders }: { orders: Order[] }) {
  const gatewayProvider = useGatewayProvider()
  const [target, setTarget] = useState<ChargeTarget | null>(null)
  const [settledMsg, setSettledMsg] = useState<string | null>(null)

  const groups = useMemo<TableGroup[]>(() => {
    const map = new Map<number, TableGroup>()
    for (const o of orders) {
      if (o.status_id === 4 || o.table_id == null) continue
      const tablesData = o.tables as
        | { table_number: number | null }
        | { table_number: number | null }[]
        | null
        | undefined
      const tableNumber = Array.isArray(tablesData)
        ? tablesData[0]?.table_number
        : tablesData?.table_number
      const label =
        tableNumber === 0 ? "Recepción" : `Mesa ${tableNumber ?? o.table_id}`
      const g = map.get(o.table_id) ?? {
        tableId: o.table_id,
        label,
        ordersCount: 0,
        total: 0,
        unreadyCount: 0,
      }
      g.ordersCount += 1
      g.total += o.total
      if (o.status_id !== 3) g.unreadyCount += 1
      map.set(o.table_id, g)
    }
    return Array.from(map.values()).sort((a, b) => a.tableId - b.tableId)
  }, [orders])

  if (groups.length === 0) return null

  return (
    <>
      <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-stone-900">Cobrar</h3>
            <p className="text-xs text-stone-500">
              Cobra la cuenta de una mesa: efectivo, tarjeta
              {gatewayProvider ? " o QR de pago por la pasarela conectada" : ""}. Cada cobro queda
              registrado y emite su boleta.
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {groups.length} mesa{groups.length === 1 ? "" : "s"} con cuenta abierta
          </span>
        </div>

        {settledMsg && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800">
            {settledMsg}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <article
              key={g.tableId}
              className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-stone-900">{g.label}</h4>
                  <p className="text-[11px] text-stone-500">
                    {g.ordersCount} pedido{g.ordersCount === 1 ? "" : "s"} activo
                    {g.ordersCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    g.unreadyCount === 0
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                  }`}
                >
                  {g.unreadyCount === 0 ? "Todos listos" : `${g.unreadyCount} en cocina`}
                </span>
              </div>

              <p className="mt-3 text-2xl font-extrabold tracking-tight text-stone-950 tabular-nums">
                {fmt(g.total)}
              </p>

              <button
                type="button"
                onClick={() => {
                  setSettledMsg(null)
                  setTarget({
                    scope: { tableId: g.tableId },
                    label: g.label,
                    total: g.total,
                    ordersCount: g.ordersCount,
                  })
                }}
                disabled={target != null}
                className="mt-3 w-full rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cobrar {g.label}
              </button>
            </article>
          ))}
        </div>
      </section>

      {target && (
        <ChargeDialog
          target={target}
          gatewayProvider={gatewayProvider}
          onClose={() => setTarget(null)}
          onSettled={(label, method) =>
            setSettledMsg(
              `${label} cobrada (${method === "cash" ? "efectivo" : method === "card" ? "tarjeta" : "en línea"}) ✅`
            )
          }
        />
      )}
    </>
  )
}
