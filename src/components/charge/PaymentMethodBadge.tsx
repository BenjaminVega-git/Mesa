type PaymentPart = {
  method: string
  amount: number
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
}

const METHOD_STYLE: Record<string, { label: string; cls: string }> = {
  cash: { label: "💵 Efectivo", cls: "bg-emerald-50 text-emerald-700" },
  card: { label: "💳 Tarjeta", cls: "bg-sky-50 text-sky-700" },
  online: { label: "📱 En línea", cls: "bg-orange-50 text-orange-700" },
  transfer: { label: "🏦 Transferencia", cls: "bg-violet-50 text-violet-700" },
  mixed: { label: "🔀 Mixto", cls: "bg-amber-50 text-amber-700" },
}

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
})

const fmt = (n: number) => clp.format(Math.round(n || 0))

export function PaymentMethodBadge({
  method,
  parts = [],
  providerLabel,
}: {
  method: string
  parts?: PaymentPart[]
  providerLabel?: string | null
}) {
  const m = METHOD_STYLE[method] ?? { label: method, cls: "bg-stone-100 text-stone-700" }
  const detail = parts
    .map((part) => `${METHOD_LABEL[part.method] ?? part.method}: ${fmt(part.amount)}`)
    .join(" · ")
  const accessibleLabel = detail ? `${m.label.replace(/^\S+\s/, "")}: ${detail}` : m.label

  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={detail || undefined}
        aria-label={accessibleLabel}
        className={`inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${m.cls}`}
      >
        {m.label}
      </span>
      {providerLabel && <span className="text-[10px] text-stone-400">{providerLabel}</span>}
    </span>
  )
}
