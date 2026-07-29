"use client"

import { useMemo, useState } from "react"
import { Wallet } from "lucide-react"
import type { WaiterOrder } from "@/services/order-service"
import { ChargeDialog, type ChargeTarget } from "@/components/charge/ChargeDialog"

const STATUS_NUEVO = 1
const STATUS_PREPARANDO = 2
const STATUS_LISTO = 3

type Props = {
  orders: WaiterOrder[]
  /** Proveedor de pasarela conectado (o null): habilita "QR de pago". */
  gatewayProvider: string | null
  /** Cobro completado por cualquier método (refrescar + toast). */
  onSettled?: (label: string, method: string) => void
}

type DinerSummary = {
  slot: number
  label: string
  ordersCount: number
  total: number
  unreadyCount: number
}

type TableSummary = {
  tableId: number
  tableLabel: string
  ordersCount: number
  total: number
  hasUnready: boolean
  unreadyCount: number
  unreadyStatuses: number[]
  diners: DinerSummary[]
}

/**
 * Sección de "Cobrar mesa": para cada mesa con pedidos activos muestra una
 * card con total + cantidad. El cobro abre el ChargeDialog (efectivo /
 * tarjeta / QR de pasarela), que registra el pago y emite la boleta.
 *
 * Si la mesa tiene varios comensales identificados, se listan con su
 * subtotal para cobrar de a uno (mismo diálogo, alcance por comensal).
 */
export function PayTableSection({ orders, gatewayProvider, onSettled }: Props) {
  const [confirmTable, setConfirmTable] = useState<TableSummary | null>(null)
  const [target, setTarget] = useState<ChargeTarget | null>(null)

  const summaries = useMemo<TableSummary[]>(() => {
    const map = new Map<number, TableSummary>()
    for (const o of orders) {
      if (o.tableId == null) continue
      if (o.statusId === 4) continue // ya pagado
      const label =
        o.tableNumber != null ? `Mesa ${o.tableNumber}` : `Mesa #${o.tableId}`
      const existing = map.get(o.tableId) ?? {
        tableId: o.tableId,
        tableLabel: label,
        ordersCount: 0,
        total: 0,
        hasUnready: false,
        unreadyCount: 0,
        unreadyStatuses: [] as number[],
        diners: [] as DinerSummary[],
      }
      existing.ordersCount += 1
      existing.total += o.total
      if (o.statusId !== STATUS_LISTO) {
        existing.hasUnready = true
        existing.unreadyCount += 1
        if (!existing.unreadyStatuses.includes(o.statusId)) {
          existing.unreadyStatuses.push(o.statusId)
        }
      }

      if (o.dinerSlot != null) {
        let diner = existing.diners.find((d) => d.slot === o.dinerSlot)
        if (!diner) {
          diner = {
            slot: o.dinerSlot,
            label: o.dinerLabel ?? `Comensal ${o.dinerSlot}`,
            ordersCount: 0,
            total: 0,
            unreadyCount: 0,
          }
          existing.diners.push(diner)
        }
        diner.ordersCount += 1
        diner.total += o.total
        if (o.statusId !== STATUS_LISTO) diner.unreadyCount += 1
      }

      map.set(o.tableId, existing)
    }
    const result = Array.from(map.values())
    result.forEach((s) => s.diners.sort((a, b) => a.slot - b.slot))
    return result.sort((a, b) => a.tableId - b.tableId)
  }, [orders])

  function openTableCharge(summary: TableSummary) {
    setConfirmTable(null)
    setTarget({
      scope: { tableId: summary.tableId },
      label: summary.tableLabel,
      total: summary.total,
      ordersCount: summary.ordersCount,
    })
  }

  function handleClick(summary: TableSummary) {
    if (summary.hasUnready) {
      setConfirmTable(summary)
      return
    }
    openTableCharge(summary)
  }

  function openDinerCharge(summary: TableSummary, diner: DinerSummary) {
    setTarget({
      scope: { tableId: summary.tableId, dinerSlot: diner.slot },
      label: `${summary.tableLabel} · ${diner.label}`,
      total: diner.total,
      ordersCount: diner.ordersCount,
    })
  }

  if (summaries.length === 0) return null

  return (
    <>
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold tracking-tight text-stone-900">Cobrar por mesa</h2>
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {summaries.length} mesa{summaries.length === 1 ? "" : "s"} con pedidos
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => {
            const allReady = !s.hasUnready
            const hasMultipleDiners = s.diners.length >= 2
            return (
              <article
                key={s.tableId}
                className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{s.tableLabel}</h3>
                    <p className="text-[11px] text-stone-500">
                      {s.ordersCount} pedido{s.ordersCount === 1 ? "" : "s"} activo
                      {s.ordersCount === 1 ? "" : "s"}
                      {hasMultipleDiners && ` · ${s.diners.length} comensales`}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      allReady
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"
                    }`}
                  >
                    {allReady ? "Todos listos" : `${s.unreadyCount} en cocina`}
                  </span>
                </div>

                <p className="mt-3 text-2xl font-extrabold tracking-tight text-stone-950">
                  ${s.total.toLocaleString("es-CL")}
                </p>

                {hasMultipleDiners && (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-stone-50 p-2.5 ring-1 ring-stone-100">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500">
                      División por comensal
                    </p>
                    {s.diners.map((d) => (
                      <div
                        key={d.slot}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-stone-100"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-800 truncate">
                            {d.label}
                          </p>
                          <p className="text-[10px] text-stone-500 tabular-nums">
                            {d.ordersCount} pedido{d.ordersCount === 1 ? "" : "s"} · $
                            {d.total.toLocaleString("es-CL")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDinerCharge(s, d)}
                          disabled={target != null}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Wallet className="h-3 w-3" aria-hidden="true" />
                          Cobrar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleClick(s)}
                  disabled={target != null}
                  className={`mt-3 w-full rounded-full px-4 py-2.5 text-xs font-bold text-white shadow transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    allReady
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {allReady
                    ? `Cobrar ${hasMultipleDiners ? "mesa completa" : s.tableLabel} (${s.ordersCount} pedido${s.ordersCount === 1 ? "" : "s"})`
                    : `Cobrar ${s.tableLabel} con advertencia`}
                </button>

                {s.ordersCount >= 2 && !hasMultipleDiners && (
                  <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-stone-500 ring-1 ring-stone-100">
                    Para dividir la cuenta, toma los pedidos marcando el comensal en
                    &quot;Tomar pedido&quot;. La division se cobra por comensal, no por pedido.
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {confirmTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
            <div className="border-b border-stone-100 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-stone-950">
                    Hay pedidos sin servir todavía
                  </h3>
                  <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                    De los <strong>{confirmTable.ordersCount}</strong> pedidos de{" "}
                    {confirmTable.tableLabel},{" "}
                    <strong>{confirmTable.unreadyCount}</strong>{" "}
                    {confirmTable.unreadyCount === 1 ? "sigue" : "siguen"} en{" "}
                    {confirmTable.unreadyStatuses.includes(STATUS_NUEVO) &&
                    confirmTable.unreadyStatuses.includes(STATUS_PREPARANDO)
                      ? "Nuevo o Preparando"
                      : confirmTable.unreadyStatuses.includes(STATUS_NUEVO)
                        ? "estado Nuevo"
                        : "Preparación"}
                    . Si cobras ahora, esos pedidos quedarán pagados pero podrían
                    no haberse servido.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 bg-stone-50">
              <button
                type="button"
                onClick={() => setConfirmTable(null)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => openTableCharge(confirmTable)}
                className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow hover:bg-orange-600 transition"
              >
                Cobrar igual
              </button>
            </div>
          </div>
        </div>
      )}

      {target && (
        <ChargeDialog
          target={target}
          gatewayProvider={gatewayProvider}
          onClose={() => setTarget(null)}
          onSettled={onSettled}
        />
      )}
    </>
  )
}
