"use client"

import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { useCashShift } from "@/hooks/useCashShift"
import { closeShift, openShift, type CloseShiftResult } from "@/services/cash-shift-service"
import { PaymentsTodaySection } from "@/components/charge/PaymentsTodaySection"

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})

function formatCLP(n: number): string {
  return clpFormatter.format(Math.round(n || 0))
}

function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "")
  return digits ? Number.parseInt(digits, 10) : 0
}

type CloseResult = CloseShiftResult

/**
 * Control de caja: SOLO el administrador abre/cierra el turno (antes vivía
 * en /waiter/caja). Los meseros ven su actividad de solo lectura en
 * Contabilidad, pero ya no controlan la apertura/cierre.
 */
export default function AdminCajaPage() {
  const { shift, loading, reload } = useCashShift()

  const [openingInput, setOpeningInput] = useState("")
  const [closingInput, setClosingInput] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null)

  const openedAtLabel = useMemo(() => {
    if (!shift?.openedAt) return ""
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(shift.openedAt)
      ? shift.openedAt
      : `${shift.openedAt}Z`
    const d = new Date(normalized)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }, [shift])

  async function handleOpen(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const amount = parseAmount(openingInput)
    setError(null)
    setSubmitting(true)
    try {
      const res = await openShift(amount)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpeningInput("")
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const amount = parseAmount(closingInput)
    setError(null)
    setSubmitting(true)
    try {
      const res = await closeShift(amount, notes.trim())
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCloseResult(res.data)
      setClosingInput("")
      setNotes("")
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Caja</h2>
        <p className="mt-1 text-sm text-stone-500">
          Abre y cierra el turno de caja, con el desglose de lo cobrado por método de pago.
        </p>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm animate-pulse">
          <div className="h-4 w-40 rounded bg-stone-100" />
          <div className="mt-4 h-10 w-full rounded bg-stone-100" />
          <div className="mt-3 h-10 w-32 rounded bg-stone-100" />
        </div>
      ) : !shift ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold tracking-tight text-stone-900">Abrir turno</h3>
          <p className="mt-1 text-sm text-stone-500">
            No hay un turno de caja abierto. Ingresa el efectivo inicial para comenzar.
          </p>
          <form onSubmit={handleOpen} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="opening"
                className="block text-xs font-bold uppercase tracking-wider text-stone-500"
              >
                Monto inicial (CLP)
              </label>
              <input
                id="opening"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="$0"
                value={openingInput ? formatCLP(parseAmount(openingInput)) : ""}
                onChange={(e) => setOpeningInput(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-lg font-bold tabular-nums text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Abriendo..." : "Abrir caja"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Apertura
              </p>
              <p className="mt-2 text-2xl font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">
                {formatCLP(shift.openingAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Ventas del turno
              </p>
              <p className="mt-2 text-2xl font-extrabold leading-none tracking-tight text-orange-600 tabular-nums">
                {formatCLP(shift.sales)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Propinas
              </p>
              <p className="mt-2 text-2xl font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">
                {formatCLP(shift.tips)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Nº de pedidos
              </p>
              <p className="mt-2 text-2xl font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">
                {shift.orders}
              </p>
            </div>
          </section>

          {/* Desglose por método: solo el efectivo debe estar en el cajón. */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                💵 Efectivo
              </p>
              <p className="mt-2 text-xl font-extrabold leading-none tracking-tight text-emerald-800 tabular-nums">
                {formatCLP(shift.salesCash)}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-emerald-700/80">
                En cajón (con apertura): {formatCLP(shift.expectedCash)}
              </p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                💳 Tarjeta
              </p>
              <p className="mt-2 text-xl font-extrabold leading-none tracking-tight text-sky-800 tabular-nums">
                {formatCLP(shift.salesCard)}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-sky-700/80">POS físico</p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-orange-50/60 px-5 py-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                📱 En línea
              </p>
              <p className="mt-2 text-xl font-extrabold leading-none tracking-tight text-orange-800 tabular-nums">
                {formatCLP(shift.salesOnline)}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold text-orange-700/80">
                Va a la cuenta de la pasarela
              </p>
            </div>
          </section>

          {openedAtLabel && (
            <p className="text-xs font-semibold text-stone-500">
              Turno abierto desde <span className="text-stone-700">{openedAtLabel}</span>
            </p>
          )}

          {closeResult && <CloseResultCard result={closeResult} />}

          <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold tracking-tight text-stone-900">Cerrar turno</h3>
            <p className="mt-1 text-sm text-stone-500">
              Cuenta el efectivo en caja y ciérrala para conciliar.
            </p>
            <form onSubmit={handleClose} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="closing"
                  className="block text-xs font-bold uppercase tracking-wider text-stone-500"
                >
                  Efectivo contado (CLP)
                </label>
                <input
                  id="closing"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="$0"
                  value={closingInput ? formatCLP(parseAmount(closingInput)) : ""}
                  onChange={(e) => setClosingInput(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-lg font-bold tabular-nums text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                />
              </div>
              <div>
                <label
                  htmlFor="notes"
                  className="block text-xs font-bold uppercase tracking-wider text-stone-500"
                >
                  Notas (opcional)
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones del cierre..."
                  className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
              >
                {submitting ? "Cerrando..." : "Cerrar caja"}
              </button>
            </form>
          </section>
        </>
      )}

      {/* Pagos del día (todos los métodos) con su boleta. */}
      <PaymentsTodaySection />
    </div>
  )
}

function CloseResultCard({ result }: { result: CloseResult }) {
  const diff = result.closing - result.expected
  const cuadra = diff === 0
  const sobra = diff > 0

  const tone = cuadra
    ? {
        border: "border-emerald-200",
        bg: "bg-emerald-50",
        title: "text-emerald-800",
        value: "text-emerald-700",
        label: "Cuadra perfecto",
      }
    : sobra
      ? {
          border: "border-amber-200",
          bg: "bg-amber-50",
          title: "text-amber-800",
          value: "text-amber-700",
          label: "Sobrante en caja",
        }
      : {
          border: "border-red-200",
          bg: "bg-red-50",
          title: "text-red-800",
          value: "text-red-700",
          label: "Faltante en caja",
        }

  return (
    <section className={`rounded-3xl border ${tone.border} ${tone.bg} p-6 shadow-sm`}>
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-bold tracking-tight ${tone.title}`}>
          Turno #{result.id} cerrado
        </h2>
        <span
          className={`rounded-full bg-white/70 px-3 py-1 text-xs font-bold ${tone.value}`}
        >
          {tone.label}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Esperado
          </p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-stone-900">
            {formatCLP(result.expected)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Contado
          </p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-stone-900">
            {formatCLP(result.closing)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Descuadre
          </p>
          <p className={`mt-1 text-xl font-extrabold tabular-nums ${tone.value}`}>
            {diff > 0 ? "+" : ""}
            {formatCLP(diff)}
          </p>
        </div>
      </div>
    </section>
  )
}
