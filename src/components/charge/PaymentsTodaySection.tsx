"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  emitBoletaForPayment,
  listPaymentsToday,
  type PaymentTodayRow,
} from "@/services/charge-service"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  paid: { label: "Pagado", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  authorized: { label: "Procesando", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  failed: { label: "Rechazado", cls: "bg-red-50 text-red-600 ring-red-200" },
  refunded: { label: "Reembolsado", cls: "bg-stone-100 text-stone-600 ring-stone-200" },
}

const METHOD_STYLE: Record<string, { label: string; cls: string }> = {
  cash: { label: "💵 Efectivo", cls: "bg-emerald-50 text-emerald-700" },
  card: { label: "💳 Tarjeta", cls: "bg-sky-50 text-sky-700" },
  online: { label: "📱 En línea", cls: "bg-orange-50 text-orange-700" },
}

function hora(iso: string): string {
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

/**
 * Pagos de HOY del restaurante — todos los métodos (efectivo, tarjeta, en
 * línea) con su boleta: folio con link imprimible, o botón "Emitir boleta"
 * si el pago quedó sin documento. Se usa en /waiter/caja y en el panel de
 * pedidos del admin.
 */
export function PaymentsTodaySection() {
  const [payments, setPayments] = useState<PaymentTodayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [emittingId, setEmittingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const res = await listPaymentsToday()
    if (res.ok) setPayments(res.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar
    load()
    const interval = window.setInterval(load, 30_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load])

  async function handleEmit(paymentId: number) {
    setEmittingId(paymentId)
    await emitBoletaForPayment(paymentId)
    setEmittingId(null)
    await load()
  }

  const paid = useMemo(() => payments.filter((p) => p.status === "paid"), [payments])
  const totalPagado = useMemo(() => paid.reduce((s, p) => s + p.amount + p.tip, 0), [paid])

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-stone-900">Pagos de hoy</h2>
          <p className="mt-1 text-sm text-stone-500">
            Todos los cobros del día calendario con su boleta (no solo del turno de caja actual).
            Lo pagado en línea llega a la cuenta de la pasarela, no a la caja.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Cobrado hoy</p>
          <p className="text-2xl font-extrabold leading-none tracking-tight text-emerald-600 tabular-nums">
            {fmt(totalPagado)}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {paid.length} {paid.length === 1 ? "pago" : "pagos"}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
            <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
          </div>
        ) : payments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
            Todavía no hay pagos hoy.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  <th className="py-2 pr-3">Hora</th>
                  <th className="py-2 pr-3">Mesa</th>
                  <th className="py-2 pr-3">Monto</th>
                  <th className="py-2 pr-3">Propina</th>
                  <th className="py-2 pr-3">Método</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Boleta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {payments.map((p) => {
                  const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.pending
                  const m = METHOD_STYLE[p.method] ?? METHOD_STYLE.online
                  const providerLabel =
                    p.method === "online"
                      ? (PAYMENT_PROVIDER_LABEL[p.provider ?? ""] ?? p.provider ?? "")
                      : null
                  return (
                    <tr key={p.id} className="text-stone-800">
                      <td className="py-2.5 pr-3 tabular-nums text-stone-500">{hora(p.createdAt)}</td>
                      <td className="py-2.5 pr-3 font-semibold">{p.tableNumber ?? "—"}</td>
                      <td className="py-2.5 pr-3 font-bold tabular-nums">{fmt(p.amount)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-stone-500">
                        {p.tip > 0 ? fmt(p.tip) : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${m.cls}`}>
                          {m.label}
                        </span>
                        {providerLabel && (
                          <span className="ml-1 text-[10px] text-stone-400">{providerLabel}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${st.cls}`}
                        >
                          {st.label}
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
                        ) : p.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => handleEmit(p.id)}
                            disabled={emittingId != null}
                            className="rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold text-white shadow transition hover:bg-orange-600 disabled:opacity-50"
                          >
                            {emittingId === p.id ? "Emitiendo…" : "Emitir boleta"}
                          </button>
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
      </div>
    </section>
  )
}
