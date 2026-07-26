"use client"

import { useEffect, useState } from "react"
import {
  getPaymentAccount,
  connectPaymentAccount,
  disconnectPaymentAccount,
} from "@/services/payments-service"
import { PAYMENT_PROVIDER_LABEL } from "@/lib/payments/types"

const INPUT_CLASS =
  "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
const LABEL_CLASS = "mb-2 block text-xs font-bold uppercase tracking-wider text-stone-500"

const GATEWAY_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  simulated: [],
  flow: [
    { key: "apiKey", label: "API Key" },
    { key: "secretKey", label: "Secret Key", type: "password" },
  ],
  mercadopago: [
    { key: "accessToken", label: "Access Token (APP_USR-…)", type: "password" },
    { key: "webhookSecret", label: "Clave secreta de webhooks", type: "password" },
  ],
  transbank: [
    { key: "commerceCode", label: "Código de comercio" },
    { key: "apiKey", label: "Api Key Secret", type: "password" },
  ],
}

// Dónde encuentra el restaurante sus credenciales, según el proveedor.
const GATEWAY_HINT: Record<string, string> = {
  flow: "En Flow: Integraciones → Integración por API. Ojo: sandbox y producción usan cuentas y llaves distintas.",
  mercadopago:
    "En Mercado Pago: Tus integraciones → tu aplicación → Producción → Credenciales. La clave secreta está en Webhooks → Configurar notificaciones.",
  transbank:
    "El código de comercio lo entrega Transbank al contratar Webpay Plus; la Api Key Secret llega por correo al aprobar la validación de integración.",
}

/**
 * Conexión de la pasarela de pago (Flow / Mercado Pago / Transbank). Vive en
 * Ajustes (junto al resto de la configuración operativa del restaurante);
 * Pagos quedó solo para datos tributarios y documentos.
 */
export function PaymentGatewaySection() {
  const [account, setAccount] = useState<{
    provider: string | null
    status: string
    hasCredentials: boolean
    connectedAt: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState("simulated")
  const [accountId, setAccountId] = useState("")
  const [environment, setEnvironment] = useState("production")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null)

  async function load() {
    const result = await getPaymentAccount()
    if (result.ok) {
      setAccount(result.data)
      if (result.data.provider) setProvider(result.data.provider)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial al montar
    load()
  }, [])

  const webhookBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const webhookUrl = `${webhookBase}/functions/v1/payment-webhook?provider=${provider}`
  const isConnected = account?.status === "connected"

  async function handleConnect() {
    if (busy) return
    const needed = GATEWAY_FIELDS[provider] ?? []
    const missing = needed.filter((f) => !fields[f.key]?.trim())
    if (missing.length > 0) {
      setFeedback({ kind: "error", message: `Completa: ${missing.map((f) => f.label).join(", ")}.` })
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      // environment decide el host del adaptador (Flow/Transbank cambian de
      // URL base; Flow además usa llaves distintas por ambiente).
      const credentials = needed.length > 0 ? JSON.stringify({ environment, ...fields }) : ""
      const result = await connectPaymentAccount({ provider, accountId, credentials })
      if (!result.ok) {
        setFeedback({ kind: "error", message: result.error })
        return
      }
      setFeedback({ kind: "ok", message: "Cuenta de cobro conectada." })
      setFields({})
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    const result = await disconnectPaymentAccount()
    setBusy(false)
    if (!result.ok) {
      setFeedback({ kind: "error", message: result.error })
      return
    }
    setFeedback({ kind: "ok", message: "Cuenta desconectada." })
    await load()
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Cobros en línea</h3>
          <p className="mt-1 text-xs font-medium text-stone-500">
            Conecta tu pasarela de pago para cobrar directo desde MESA.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${
            isConnected ? "bg-green-50 text-green-700 ring-green-200" : "bg-amber-50 text-amber-700 ring-amber-200"
          }`}
        >
          {loading ? "Cargando..." : isConnected ? "Conectado" : "Sin conectar"}
        </span>
      </div>

      {isConnected ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50 px-5 py-4 ring-1 ring-green-200">
          <div className="text-sm">
            <p className="font-bold text-green-800">
              {PAYMENT_PROVIDER_LABEL[account!.provider ?? ""] ?? account!.provider} conectado ✓
            </p>
            <p className="text-xs text-green-700/90">
              {account!.hasCredentials ? "Credenciales guardadas (cifradas)." : "Sin credenciales."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Desconectar
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Proveedor</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  setFields({})
                }}
                className={INPUT_CLASS}
              >
                {Object.entries(PAYMENT_PROVIDER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>ID de cuenta (opcional)</label>
              <input value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INPUT_CLASS} />
            </div>
            {provider !== "simulated" ? (
              <div>
                <label className={LABEL_CLASS}>Ambiente</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className={INPUT_CLASS}>
                  <option value="production">Producción (cobros reales)</option>
                  <option value="test">Pruebas (sandbox / integración)</option>
                </select>
              </div>
            ) : null}
            {(GATEWAY_FIELDS[provider] ?? []).map((f) => (
              <div key={f.key}>
                <label className={LABEL_CLASS}>{f.label}</label>
                <input
                  type={f.type ?? "text"}
                  autoComplete="off"
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={busy}
            className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? "Conectando…" : "Conectar cuenta"}
          </button>
          {provider === "simulated" ? (
            <p className="mt-2 text-[11px] text-amber-600">Modo simulado: no cobra dinero real, sirve para probar el circuito.</p>
          ) : GATEWAY_HINT[provider] ? (
            <p className="mt-2 text-[11px] text-stone-500">{GATEWAY_HINT[provider]}</p>
          ) : null}
        </div>
      )}

      {/* URL de webhook a configurar en el panel de la pasarela. Transbank
          Webpay Plus NO usa webhooks: confirma por retorno + commit. */}
      {provider === "transbank" ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Notificaciones</p>
          <p className="mt-1 text-[11px] text-stone-500">
            Transbank Webpay Plus no usa webhooks: MESA confirma cada pago automáticamente cuando el
            comensal vuelve del formulario de pago. No hay nada que configurar en Transbank.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">URL de notificaciones (webhook)</p>
          <p className="mt-1 break-all font-mono text-[11px] text-stone-600">{webhookUrl}</p>
          <p className="mt-1 text-[11px] text-stone-400">Configura esta URL en el panel de tu pasarela para recibir la confirmación de los pagos.</p>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
            feedback.kind === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  )
}
