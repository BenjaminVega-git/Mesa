"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Banknote, CreditCard, QrCode, Receipt } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import {
  createStaffGatewayCharge,
  emitBoletaForPayment,
  getStaffPayment,
  registerStaffPayment,
  type BoletaInfo,
  type ChargeScope,
} from "@/services/charge-service"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})
const fmt = (n: number) => clp.format(Math.round(n || 0))

export type ChargeTarget = {
  scope: ChargeScope
  /** "Mesa 4" o "Mesa 4 · Comensal 2" o "Pedido #123 · Mesa 4". */
  label: string
  total: number
  ordersCount: number
}

type Step =
  | { kind: "method" }
  | { kind: "charging"; method: "cash" | "card" }
  | { kind: "gateway-email" }
  | { kind: "gateway-creating" }
  | { kind: "gateway-qr"; checkoutUrl: string; paymentId: number }
  | {
      kind: "done"
      method: string
      paymentId: number
      boleta: BoletaInfo | null
      boletaError: string | null
    }

/**
 * Diálogo de COBRO compartido entre el panel admin y la app del mesero.
 * Ofrece efectivo / tarjeta (registro inmediato + boleta automática) y, si el
 * restaurante tiene pasarela conectada, "QR de pago": genera el link en la
 * pasarela, lo muestra como QR para que el comensal lo escanee y observa el
 * pago por polling hasta confirmarlo (los pedidos se asientan por webhook).
 */
export function ChargeDialog({
  target,
  gatewayProvider,
  onClose,
  onSettled,
}: {
  target: ChargeTarget
  /** Proveedor conectado ("flow" | "mercadopago" | "transbank") o null. */
  gatewayProvider: string | null
  onClose: () => void
  /** Cobro completado (cualquier método): refrescar listas + toast. */
  onSettled?: (label: string, method: string) => void
}) {
  const [step, setStep] = useState<Step>({ kind: "method" })
  // Propina en % del total del pedido (no un monto fijo): las opciones
  // rápidas son 0/5/10/15%; "Otro %" habilita un valor a medida.
  const TIP_PRESETS = [0, 5, 10, 15] as const
  const [tipPct, setTipPct] = useState<number>(0)
  const [customPct, setCustomPct] = useState("")
  const [customPctOpen, setCustomPctOpen] = useState(false)
  const tip = Math.round((target.total * tipPct) / 100)
  const [payerEmail, setPayerEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [retryingBoleta, setRetryingBoleta] = useState(false)
  const settledRef = useRef(false)

  const providerLabel = gatewayProvider
    ? (PAYMENT_PROVIDER_LABEL[gatewayProvider] ?? gatewayProvider)
    : null

  const settle = useCallback(
    (method: string) => {
      if (settledRef.current) return
      settledRef.current = true
      onSettled?.(target.label, method)
    },
    [onSettled, target.label]
  )

  async function chargePresential(method: "cash" | "card") {
    setError(null)
    setStep({ kind: "charging", method })
    const res = await registerStaffPayment({ ...target.scope, tip }, method)
    if (!res.ok) {
      setError(res.error)
      setStep({ kind: "method" })
      return
    }
    settle(method)
    setStep({
      kind: "done",
      method,
      paymentId: res.data.paymentId,
      boleta: res.data.boleta,
      boletaError: res.data.boletaError,
    })
  }

  async function startGateway() {
    // Flow exige el email del pagador (ahí manda su comprobante).
    if (gatewayProvider === "flow" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())) {
      setStep({ kind: "gateway-email" })
      return
    }
    setError(null)
    setStep({ kind: "gateway-creating" })
    const res = await createStaffGatewayCharge({ ...target.scope, tip }, payerEmail.trim() || undefined)
    if (!res.ok) {
      setError(res.error)
      setStep({ kind: "method" })
      return
    }
    setStep({ kind: "gateway-qr", checkoutUrl: res.data.checkoutUrl, paymentId: res.data.paymentId })
  }

  // Polling del pago por pasarela mientras el QR está en pantalla.
  useEffect(() => {
    if (step.kind !== "gateway-qr") return
    const paymentId = step.paymentId
    let cancelled = false

    const check = async () => {
      const res = await getStaffPayment(paymentId)
      if (cancelled || !res.ok) return
      if (res.data.status === "paid") {
        settle("online")
        // Boleta automática también para el pago por pasarela.
        const boleta = await emitBoletaForPayment(paymentId)
        if (cancelled) return
        setStep({
          kind: "done",
          method: "online",
          paymentId,
          boleta: boleta.ok ? boleta.data : null,
          boletaError: boleta.ok ? null : boleta.error,
        })
      } else if (res.data.status === "failed") {
        setError("El pago fue rechazado por la pasarela")
        setStep({ kind: "method" })
      }
    }

    const interval = window.setInterval(check, 3500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [step, settle])

  async function retryBoleta(paymentId: number) {
    setRetryingBoleta(true)
    const res = await emitBoletaForPayment(paymentId)
    setRetryingBoleta(false)
    setStep((prev) =>
      prev.kind === "done"
        ? {
            ...prev,
            boleta: res.ok ? res.data : prev.boleta,
            boletaError: res.ok ? null : res.error,
          }
        : prev
    )
  }

  const busy =
    step.kind === "charging" || step.kind === "gateway-creating"

  const METHOD_LABEL: Record<string, string> = {
    cash: "Efectivo",
    card: "Tarjeta",
    online: providerLabel ? `En línea (${providerLabel})` : "En línea",
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
        {/* Encabezado */}
        <div className="border-b border-stone-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold tracking-tight text-stone-950">
                Cobrar {target.label}
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {target.ordersCount} pedido{target.ordersCount === 1 ? "" : "s"} · Total{" "}
                <strong className="tabular-nums text-stone-800">{fmt(target.total)}</strong>
                {tip > 0 && (
                  <>
                    {" "}+ propina <strong className="tabular-nums">{fmt(tip)}</strong>
                  </>
                )}
              </p>
            </div>
            {step.kind !== "done" && (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40"
                aria-label="Cerrar"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* Paso 1: elegir método */}
          {(step.kind === "method" || step.kind === "charging") && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Propina (% del total, opcional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TIP_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setTipPct(pct)
                        setCustomPctOpen(false)
                      }}
                      disabled={busy}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                        !customPctOpen && tipPct === pct
                          ? "bg-orange-500 text-white shadow"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {pct === 0 ? "Sin propina" : `${pct}%`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPctOpen(true)
                      setCustomPct(tipPct ? String(tipPct) : "")
                    }}
                    disabled={busy}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                      customPctOpen
                        ? "bg-orange-500 text-white shadow"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    Otro %
                  </button>
                </div>
                {customPctOpen && (
                  <div className="mt-2 flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      autoFocus
                      placeholder="0"
                      value={customPct}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)))
                        setCustomPct(e.target.value)
                        setTipPct(v)
                      }}
                      disabled={busy}
                      className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none tabular-nums"
                    />
                    <span className="text-xs font-semibold text-stone-400">%</span>
                  </div>
                )}
                {tip > 0 && (
                  <p className="mt-2 text-[11px] font-semibold text-stone-500">
                    Subtotal {fmt(target.total)} + propina ({tipPct}%){" "}
                    <strong className="text-stone-700">{fmt(tip)}</strong> = total{" "}
                    <strong className="text-stone-900">{fmt(target.total + tip)}</strong>
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => chargePresential("cash")}
                  disabled={busy}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50"
                >
                  <span className="flex items-center gap-3">
                    <Banknote className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-bold text-stone-900">Efectivo</span>
                      <span className="block text-[11px] text-stone-500">
                        Registra el cobro y emite la boleta
                      </span>
                    </span>
                  </span>
                  {step.kind === "charging" && step.method === "cash" && (
                    <span className="text-xs font-bold text-stone-400">…</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => chargePresential("card")}
                  disabled={busy}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 disabled:opacity-50"
                >
                  <span className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-bold text-stone-900">Tarjeta</span>
                      <span className="block text-[11px] text-stone-500">
                        Pagado en tu POS físico · registra y emite boleta
                      </span>
                    </span>
                  </span>
                  {step.kind === "charging" && step.method === "card" && (
                    <span className="text-xs font-bold text-stone-400">…</span>
                  )}
                </button>

                {gatewayProvider && (
                  <button
                    type="button"
                    onClick={startGateway}
                    disabled={busy}
                    className="flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-3.5 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-3">
                      <QrCode className="h-5 w-5 shrink-0 text-orange-600" aria-hidden="true" />
                      <span>
                        <span className="block text-sm font-bold text-stone-900">
                          QR de pago ({providerLabel})
                        </span>
                        <span className="block text-[11px] text-stone-500">
                          El comensal escanea y paga desde su teléfono
                        </span>
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Email del pagador (solo Flow) */}
          {step.kind === "gateway-email" && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-stone-600">
                {providerLabel} necesita el <strong>email del comensal</strong> para enviarle su
                comprobante de pago.
              </p>
              <input
                type="email"
                autoFocus
                placeholder="comensal@correo.cl"
                value={payerEmail}
                onChange={(e) => setPayerEmail(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep({ kind: "method" })}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={startGateway}
                  disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail.trim())}
                  className="rounded-full bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:opacity-50"
                >
                  Generar QR de pago
                </button>
              </div>
            </div>
          )}

          {/* Generando el cobro en la pasarela */}
          {step.kind === "gateway-creating" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-orange-200 border-t-orange-500" />
              <p className="text-xs font-semibold text-stone-500">
                Generando el cobro en {providerLabel}…
              </p>
            </div>
          )}

          {/* QR de pago en pantalla + polling */}
          {step.kind === "gateway-qr" && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-center text-xs leading-relaxed text-stone-600">
                Muéstrale este código al comensal: lo escanea con la cámara de su teléfono y paga
                en {providerLabel}.
              </p>
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <QRCodeSVG value={step.checkoutUrl} size={196} marginSize={1} />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                Esperando el pago…
              </div>
              <a
                href={step.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-stone-400 underline-offset-2 hover:text-orange-600 hover:underline"
              >
                Abrir link de pago
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
              >
                Cerrar (el pago sigue activo)
              </button>
            </div>
          )}

          {/* Cobro completado */}
          {step.kind === "done" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div className="text-center">
                <h4 className="text-base font-bold tracking-tight text-stone-950">
                  Cobro registrado
                </h4>
                <p className="mt-1 text-xs text-stone-500">
                  {target.label} · {fmt(target.total + tip)} · {METHOD_LABEL[step.method] ?? step.method}
                </p>
              </div>

              {step.boleta ? (
                <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-center">
                  <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800">
                    <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                    Boleta emitida{step.boleta.folio != null ? ` · Folio N° ${step.boleta.folio}` : ""}
                  </p>
                  <a
                    href={`/boleta/${step.paymentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block rounded-full bg-emerald-600 px-4 py-1.5 text-[11px] font-bold text-white shadow transition hover:bg-emerald-700"
                  >
                    Ver / imprimir boleta
                  </a>
                </div>
              ) : (
                <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-xs font-semibold text-amber-800">
                    El cobro quedó registrado, pero la boleta no se pudo emitir
                    {step.boletaError ? `: ${step.boletaError}` : ""}.
                  </p>
                  <button
                    type="button"
                    onClick={() => retryBoleta(step.paymentId)}
                    disabled={retryingBoleta}
                    className="mt-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-[11px] font-bold text-white shadow transition hover:bg-amber-700 disabled:opacity-50"
                  >
                    {retryingBoleta ? "Emitiendo…" : "Reintentar boleta"}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-stone-950 px-6 py-2.5 text-xs font-bold text-white shadow transition hover:bg-stone-800"
              >
                Listo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
