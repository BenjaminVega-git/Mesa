"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  annulStaffPayment,
  emitBoletaForPayment,
  listPaymentsToday,
  type PaymentTodayRow,
} from "@/services/charge-service"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { PaymentMethodBadge } from "@/components/charge/PaymentMethodBadge"

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
  refunded: { label: "Anulado", cls: "bg-stone-100 text-stone-600 ring-stone-200" },
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
  const [annullingId, setAnnullingId] = useState<number | null>(null)
  const [annulTarget, setAnnulTarget] = useState<PaymentTodayRow | null>(null)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

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
    const onPaymentSettled = () => load()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("mesa:payment-settled", onPaymentSettled)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("mesa:payment-settled", onPaymentSettled)
    }
  }, [load])

  async function handleEmit(paymentId: number) {
    setEmittingId(paymentId)
    const res = await emitBoletaForPayment(paymentId)
    if (!res.ok) setFeedback({ kind: "error", message: res.error })
    else setFeedback({ kind: "ok", message: "Boleta emitida." })
    setEmittingId(null)
    await load()
  }

  async function handleConfirmAnnul() {
    if (!annulTarget || annullingId != null) return
    setAnnullingId(annulTarget.id)
    setFeedback(null)
    const res = await annulStaffPayment(annulTarget.id, "Anulada desde pagos de hoy")
    setAnnullingId(null)
    if (!res.ok) {
      setFeedback({ kind: "error", message: res.error })
      return
    }
    setAnnulTarget(null)
    setFeedback({ kind: "ok", message: "Venta anulada." })
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

      {feedback ? (
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

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
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  <th className="py-2 pr-3">Hora</th>
                  <th className="py-2 pr-3">Mesa</th>
                  <th className="py-2 pr-3">Monto</th>
                  <th className="py-2 pr-3">Propina</th>
                  <th className="py-2 pr-3">Método</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Boleta</th>
                  <th className="py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {payments.map((p) => {
                  const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.pending
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
                        <PaymentMethodBadge method={p.method} parts={p.parts} providerLabel={providerLabel} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
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
                      <td className="py-2.5 text-right">
                        {p.status === "paid" ? (
                          <button
                            type="button"
                            onClick={() => setAnnulTarget(p)}
                            disabled={annullingId != null || emittingId != null}
                            className="rounded-full px-2.5 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {annullingId === p.id ? "Anulando…" : "Anular"}
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
      <ConfirmDialog
        open={annulTarget !== null}
        title="¿Anular esta venta?"
        description={`Se marcará como anulada, dejará de sumar como pagada y su boleta quedará anulada.${annulTarget ? ` Venta por ${fmt(annulTarget.amount + annulTarget.tip)}${annulTarget.tableNumber ? `, mesa ${annulTarget.tableNumber}` : ""}.` : ""}`}
        confirmLabel={annullingId != null ? "Anulando..." : "Sí, anular venta"}
        cancelLabel="No, mantener venta"
        onConfirm={handleConfirmAnnul}
        onCancel={() => {
          if (annullingId == null) setAnnulTarget(null)
        }}
      />
    </section>
  )
}
