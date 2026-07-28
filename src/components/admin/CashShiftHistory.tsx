"use client"

import { useEffect, useState } from "react"
import { ChevronDown, History } from "lucide-react"
import { listPastShifts, type PastShift } from "@/services/cash-shift-service"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

function fmtDateTime(iso: string): string {
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function diffBadge(diff: number) {
  if (diff === 0) {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">Cuadra</span>
  }
  const sobra = diff > 0
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
        sobra ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"
      }`}
    >
      {sobra ? "+" : ""}
      {fmt(diff)}
    </span>
  )
}

/**
 * Historial de turnos de caja cerrados: cada fila muestra quién abrió y
 * quién cerró, el rango de fechas y si cuadró. Colapsado por defecto para no
 * abrumar la pantalla — el turno EN CURSO ya se muestra arriba en detalle.
 */
export function CashShiftHistory({ refreshKey }: { refreshKey: number }) {
  const [shifts, setShifts] = useState<PastShift[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch al abrir/tras cerrar un turno (refreshKey)
    setLoading(true)
    listPastShifts(20).then((res) => {
      if (!active) return
      setShifts(res.ok ? res.data : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  return (
    <section className="rounded-3xl border border-stone-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left"
      >
        <span className="flex items-center gap-2.5">
          <History className="h-5 w-5 text-stone-500" aria-hidden="true" />
          <span>
            <span className="block text-sm font-bold text-stone-900">Historial de cierres</span>
            <span className="block text-xs text-stone-500">
              {loading ? "Cargando…" : `${shifts.length} turno${shifts.length === 1 ? "" : "s"} cerrado${shifts.length === 1 ? "" : "s"}`}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-stone-100 px-6 py-4">
          {shifts.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone-500">Aún no hay turnos cerrados.</p>
          ) : (
            <ul className="space-y-2">
              {shifts.map((s) => {
                const expanded = expandedId === s.id
                return (
                  <li key={s.id} className="rounded-2xl border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-900">
                          {fmtDateTime(s.openedAt)} → {fmtDateTime(s.closedAt)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          Abrió {s.openedByName ?? "—"} · Cerró {s.closedByName ?? "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {diffBadge(s.difference)}
                        <ChevronDown
                          className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                    {expanded && (
                      <div className="grid gap-3 border-t border-stone-100 px-4 py-4 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Apertura</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-stone-900">{fmt(s.openingAmount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Esperado</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-stone-900">{fmt(s.expectedCash)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Contado</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-stone-900">{fmt(s.closingAmount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Efectivo</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">{fmt(s.cashSales)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Tarjeta</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-sky-700">{fmt(s.cardSales)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">En línea</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-orange-700">{fmt(s.onlineSales)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Propinas</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-stone-900">{fmt(s.tips)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Pedidos</p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-stone-900">{s.ordersCount}</p>
                        </div>
                        {s.notes && (
                          <div className="col-span-full">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Notas</p>
                            <p className="mt-0.5 text-sm text-stone-700">{s.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
