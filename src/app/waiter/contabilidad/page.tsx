"use client"

import { useEffect, useState } from "react"
import {
  listOrdersHistory,
  listPaymentsHistory,
  type OrderHistoryRow,
  type PaymentHistoryRow,
} from "@/services/accounting-service"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"
import { PaymentMethodBadge } from "@/components/charge/PaymentMethodBadge"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

function fecha(iso: string): string {
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  authorized: "bg-amber-50 text-amber-700 ring-amber-200",
  failed: "bg-red-50 text-red-600 ring-red-200",
  refunded: "bg-stone-100 text-stone-600 ring-stone-200",
}
const STATUS_LABEL: Record<string, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  authorized: "Procesando",
  failed: "Rechazado",
  refunded: "Reembolsado",
}
/**
 * CONTABILIDAD del mesero: historial de solo lectura — pedidos tomados y
 * todas las boletas emitidas por el sistema. La apertura/cierre de caja se
 * movió a /admin/caja; esto es solo consulta.
 */
export default function ContabilidadPage() {
  const [tab, setTab] = useState<"pedidos" | "boletas">("pedidos")
  const [orders, setOrders] = useState<OrderHistoryRow[]>([])
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listOrdersHistory(100), listPaymentsHistory(100)]).then(([o, p]) => {
      if (o.ok) setOrders(o.data)
      if (p.ok) setPayments(p.data)
      setLoading(false)
    })
  }, [])

  return (
    <div className="pb-20 font-sans text-stone-900">
      <div className="mx-auto max-w-4xl">
        <span className="text-[10px] font-bold tracking-widest text-orange-600 uppercase">
          Historial
        </span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-stone-950">
          Contabilidad
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Últimos {Math.max(orders.length, payments.length)} registros. Solo lectura.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("pedidos")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              tab === "pedidos" ? "bg-stone-950 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
            }`}
          >
            Pedidos tomados
          </button>
          <button
            type="button"
            onClick={() => setTab("boletas")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              tab === "boletas" ? "bg-stone-950 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
            }`}
          >
            Boletas
          </button>
        </div>

        <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
          {loading ? (
            <div className="space-y-2">
              <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
              <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
              <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            </div>
          ) : tab === "pedidos" ? (
            orders.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                Todavía no hay pedidos registrados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Mesa</th>
                      <th className="py-2 pr-3">Detalle</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Estado</th>
                      <th className="py-2">Cobrado por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {orders.map((o) => (
                      <tr key={o.id} className="align-top text-stone-800">
                        <td className="py-2.5 pr-3 tabular-nums text-stone-500">{fecha(o.createdAt)}</td>
                        <td className="py-2.5 pr-3 font-semibold">{o.tableNumber ?? "—"}</td>
                        <td className="py-2.5 pr-3 max-w-[260px] truncate text-stone-600">
                          {o.items.map((it) => `${it.quantity}× ${it.productName}`).join(", ") || "—"}
                        </td>
                        <td className="py-2.5 pr-3 font-bold tabular-nums">
                          {fmt(o.total)}
                          {o.tipAmount > 0 && (
                            <span className="ml-1 text-[11px] font-semibold text-stone-400">
                              +{fmt(o.tipAmount)} propina
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
                            {o.statusName ?? "—"}
                          </span>
                        </td>
                        <td className="py-2.5 text-stone-500">{o.paidByName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : payments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
              Todavía no hay boletas emitidas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Mesa</th>
                    <th className="py-2 pr-3">Monto</th>
                    <th className="py-2 pr-3">Método</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2">Boleta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {payments.map((p) => {
                    const providerLabel =
                      p.method === "online" ? (PAYMENT_PROVIDER_LABEL[p.provider ?? ""] ?? p.provider) : null
                    return (
                      <tr key={p.id} className="text-stone-800">
                        <td className="py-2.5 pr-3 tabular-nums text-stone-500">{fecha(p.createdAt)}</td>
                        <td className="py-2.5 pr-3 font-semibold">{p.tableNumber ?? "—"}</td>
                        <td className="py-2.5 pr-3 font-bold tabular-nums">{fmt(p.amount + p.tip)}</td>
                        <td className="py-2.5 pr-3">
                          <PaymentMethodBadge method={p.method} parts={p.parts} providerLabel={providerLabel} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${STATUS_STYLE[p.status] ?? STATUS_STYLE.pending}`}
                          >
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {p.boleta ? (
                            <a
                              href={`/boleta/${p.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-700 transition hover:bg-stone-200"
                            >
                              🧾 N° {p.boleta.folio ?? p.boleta.id}
                            </a>
                          ) : (
                            <span className="text-[11px] text-stone-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
