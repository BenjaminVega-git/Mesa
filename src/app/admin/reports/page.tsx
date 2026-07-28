"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import {
  getSalesReport,
  getProductMargins,
  getPeakHours,
  type ReportRange,
  type SalesSummary,
  type TopProduct,
  type SalesByTable,
  type TimeBucket,
  type ProductMargin,
  type PeakHour,
} from "@/services/report-service"
import { useMyPlan } from "@/hooks/useMyPlan"
import {
  CHART_PALETTE,
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  marginColor,
  formatPctChange,
  pctChangeDirection,
} from "@/lib/charts/theme"

type PresetId = "today" | "week" | "month" | "3m" | "year" | "custom"

type Preset = {
  id: PresetId
  label: string
  build: () => Pick<ReportRange, "from" | "to" | "granularity">
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function addMonths(d: Date, n: number) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

const PRESETS: Preset[] = [
  {
    id: "today",
    label: "Hoy",
    build: () => {
      const from = startOfDay(new Date())
      const to = addDays(from, 1)
      return { from: from.toISOString(), to: to.toISOString(), granularity: "hour" }
    },
  },
  {
    id: "week",
    label: "Semana",
    build: () => {
      const today = startOfDay(new Date())
      const day = today.getDay() === 0 ? 6 : today.getDay() - 1
      const from = addDays(today, -day)
      const to = addDays(today, 1)
      return { from: from.toISOString(), to: to.toISOString(), granularity: "day" }
    },
  },
  {
    id: "month",
    label: "Mes",
    build: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = addDays(startOfDay(new Date()), 1)
      return { from: from.toISOString(), to: to.toISOString(), granularity: "day" }
    },
  },
  {
    id: "3m",
    label: "3 meses",
    build: () => {
      const today = startOfDay(new Date())
      const from = addMonths(today, -3)
      const to = addDays(today, 1)
      return { from: from.toISOString(), to: to.toISOString(), granularity: "month" }
    },
  },
  {
    id: "year",
    label: "Año",
    build: () => {
      const today = startOfDay(new Date())
      const from = addMonths(today, -12)
      const to = addDays(today, 1)
      return { from: from.toISOString(), to: to.toISOString(), granularity: "month" }
    },
  },
]

function formatCLP(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`
}

type PeakDatum = { label: string; revenue: number; orders: number }

function PeakTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: PeakDatum }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-bold text-stone-900">{d.label}</p>
      <p className="mt-1 text-orange-600">Ventas: {formatCLP(d.revenue)}</p>
      <p className="text-stone-600">Pedidos: {d.orders}</p>
    </div>
  )
}

function formatBucket(bucket: string, granularity: ReportRange["granularity"]) {
  const d = new Date(bucket)
  if (granularity === "hour") {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit" })
  }
  if (granularity === "day") {
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })
  }
  return d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
}

/** Mismo largo de rango, inmediatamente anterior — para comparar "vs período anterior". */
function previousRange(range: ReportRange): ReportRange {
  const from = new Date(range.from).getTime()
  const to = new Date(range.to).getTime()
  const duration = to - from
  return {
    from: new Date(from - duration).toISOString(),
    to: new Date(from).toISOString(),
    granularity: range.granularity,
  }
}

function TrendBadge({ curr, prev }: { curr: number; prev: number }) {
  const dir = pctChangeDirection(curr, prev)
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus
  const cls =
    dir === "up"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : dir === "down"
      ? "bg-red-50 text-red-700 ring-red-200"
      : "bg-stone-100 text-stone-600 ring-stone-200"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatPctChange(curr, prev)}
    </span>
  )
}

export default function ReportsPage() {
  const [presetId, setPresetId] = useState<PresetId>("today")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [summary, setSummary] = useState<SalesSummary | null>(null)
  const [prevSummary, setPrevSummary] = useState<SalesSummary | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [salesByTable, setSalesByTable] = useState<SalesByTable[]>([])
  const [timeline, setTimeline] = useState<TimeBucket[]>([])
  const [productMargins, setProductMargins] = useState<ProductMargin[]>([])
  const [peakHours, setPeakHours] = useState<PeakHour[]>([])

  const { plan } = useMyPlan()
  const canAdvanced = !plan || plan.has_reports_advanced

  const range = useMemo<ReportRange | null>(() => {
    if (presetId === "custom") {
      if (!customFrom || !customTo) return null
      const from = startOfDay(new Date(customFrom))
      const to = addDays(startOfDay(new Date(customTo)), 1)
      const days = Math.round((to.getTime() - from.getTime()) / 86400000)
      const granularity: ReportRange["granularity"] = days <= 2 ? "hour" : days <= 90 ? "day" : "month"
      return { from: from.toISOString(), to: to.toISOString(), granularity }
    }
    const preset = PRESETS.find((p) => p.id === presetId)
    return preset ? preset.build() : null
  }, [presetId, customFrom, customTo])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de reporte al cambiar el rango
    setLoading(true)
    setError(null)
    Promise.all([
      getSalesReport(range),
      getSalesReport(previousRange(range)),
      canAdvanced ? getProductMargins(range) : Promise.resolve(null),
      canAdvanced ? getPeakHours(range) : Promise.resolve(null),
    ])
      .then(([salesRes, prevRes, marginsRes, peakRes]) => {
        if (cancelled) return
        if (!salesRes.ok) {
          setError(salesRes.error)
          return
        }
        setSummary(salesRes.data.summary)
        setPrevSummary(prevRes.ok ? prevRes.data.summary : null)
        setTopProducts(salesRes.data.topProducts)
        setSalesByTable(salesRes.data.salesByTable)
        setTimeline(salesRes.data.timeline)
        setProductMargins(marginsRes && marginsRes.ok ? marginsRes.data : [])
        setPeakHours(peakRes && peakRes.ok ? peakRes.data : [])
      })
      .catch(() => {
        if (!cancelled) setError("Error inesperado")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range, canAdvanced])

  const chartData = timeline.map((t) => ({
    bucket: range ? formatBucket(t.bucket, range.granularity) : t.bucket,
    revenue: t.revenue,
    orderCount: t.orderCount,
  }))

  const peakChartData = Array.from({ length: 24 }, (_, hour) => {
    const found = peakHours.find((p) => p.hour === hour)
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      revenue: found ? found.revenue : 0,
      orders: found ? found.orders : 0,
    }
  })
  const peakHourValue = peakChartData.reduce(
    (best, d) => (d.revenue > best.revenue ? d : best),
    peakChartData[0]
  )?.hour

  const topProductsChartData = [...topProducts]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map((p) => ({
      name: p.variantName ? `${p.productName} · ${p.variantName}` : p.productName,
      revenue: p.revenue,
    }))
    .reverse() // recharts vertical bar dibuja de abajo hacia arriba

  const TABLE_DONUT_LIMIT = 6
  const salesByTableChartData = (() => {
    const sorted = [...salesByTable].sort((a, b) => b.revenue - a.revenue)
    const top = sorted.slice(0, TABLE_DONUT_LIMIT).map((t) => ({
      name: `Mesa ${t.tableNumber ?? t.tableId}`,
      value: t.revenue,
    }))
    const rest = sorted.slice(TABLE_DONUT_LIMIT)
    if (rest.length > 0) {
      top.push({ name: `Otras (${rest.length})`, value: rest.reduce((s, t) => s + t.revenue, 0) })
    }
    return top
  })()

  const marginChartData = [...productMargins]
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 10)
    .map((m) => ({ name: m.productName, marginPct: Math.round(m.marginPct) }))
    .reverse()

  function marginPctClass(pct: number) {
    if (pct >= 50) return "text-green-600"
    if (pct >= 20) return "text-amber-600"
    return "text-red-600"
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Reportes</h2>
        <p className="mt-1 text-sm text-stone-500">
          Ventas reales (pedidos pagados) en el período seleccionado.
        </p>
      </section>

      {/* PRESET SELECTOR */}
      <section className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPresetId(preset.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              presetId === preset.id
                ? "bg-stone-900 text-white shadow"
                : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPresetId("custom")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            presetId === "custom"
              ? "bg-stone-900 text-white shadow"
              : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
          }`}
        >
          Personalizado
        </button>
        {presetId === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
            <span className="text-stone-500">a</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>
        )}
      </section>

      {loading && (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-center text-sm font-semibold text-stone-500 animate-pulse">
          Cargando reporte...
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && summary && (
        <>
          {/* KPI CARDS */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-200 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Total facturado</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-extrabold leading-none tracking-tight text-orange-600 tabular-nums">
                  {formatCLP(summary.totalRevenue)}
                </p>
                {prevSummary && <TrendBadge curr={summary.totalRevenue} prev={prevSummary.totalRevenue} />}
              </div>
              <p className="mt-1.5 text-[11px] text-stone-400">vs período anterior</p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-200 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Pedidos pagados</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">
                  {summary.orderCount}
                </p>
                {prevSummary && <TrendBadge curr={summary.orderCount} prev={prevSummary.orderCount} />}
              </div>
              <p className="mt-1.5 text-[11px] text-stone-400">vs período anterior</p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-stone-200 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Promedio por pedido</p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">
                  {formatCLP(summary.averageTicket)}
                </p>
                {prevSummary && <TrendBadge curr={summary.averageTicket} prev={prevSummary.averageTicket} />}
              </div>
              <p className="mt-1.5 text-[11px] text-stone-400">vs período anterior</p>
            </div>
          </section>

          {/* TIMELINE CHART */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm">
            <h3 className="text-lg font-bold text-stone-900">Distribución temporal</h3>
            <p className="mt-1 text-xs text-stone-500">
              {range?.granularity === "hour"
                ? "Por hora"
                : range?.granularity === "day"
                ? "Por día"
                : "Por mes"}
            </p>
            {chartData.length === 0 ? (
              <p className="mt-6 text-center text-sm text-stone-500">Sin datos en el período.</p>
            ) : (
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <defs>
                      <linearGradient id="revenueBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fb923c" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} />
                    <YAxis
                      yAxisId="revenue"
                      tick={{ fontSize: 11 }}
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={(v) => `$${(v / 1000).toLocaleString("es-CL")}k`}
                    />
                    <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => {
                        const num = typeof value === "number" ? value : Number(value ?? 0)
                        return name === "Ventas" ? formatCLP(num) : num
                      }}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                    <Bar
                      yAxisId="revenue"
                      dataKey="revenue"
                      name="Ventas"
                      fill="url(#revenueBarGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                    <Line
                      yAxisId="orders"
                      type="monotone"
                      dataKey="orderCount"
                      name="Pedidos"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#0ea5e9" }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* TOP PRODUCTS */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm">
            <h3 className="text-lg font-bold text-stone-900">Productos más vendidos</h3>
            {topProducts.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">Sin ventas en el período.</p>
            ) : (
              <>
                <div className="mt-4 w-full" style={{ height: Math.max(180, topProductsChartData.length * 36) }}>
                  <ResponsiveContainer>
                    <ComposedChart data={topProductsChartData} layout="vertical" margin={{ left: 8, right: 48 }}>
                      <defs>
                        <linearGradient id="topProductsGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#fdba74" />
                          <stop offset="100%" stopColor="#f97316" />
                        </linearGradient>
                      </defs>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={160}
                        tick={{ fontSize: 11 }}
                        stroke={CHART_AXIS_STROKE}
                        interval={0}
                      />
                      <Tooltip
                        formatter={(value) => formatCLP(typeof value === "number" ? value : Number(value ?? 0))}
                        labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                        contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                        cursor={{ fill: "#fafaf9" }}
                      />
                      <Bar dataKey="revenue" name="Ventas" fill="url(#topProductsGradient)" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        <LabelList dataKey="revenue" position="right" formatter={(v) => formatCLP(Number(v ?? 0))} style={{ fontSize: 11, fontWeight: 700, fill: "#1c1917" }} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                      <th className="pb-2 pr-4">Producto</th>
                      <th className="pb-2 pr-4 text-right">Unidades</th>
                      <th className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.slice(0, 20).map((p) => (
                      <tr
                        key={`${p.productName}-${p.variantName ?? ""}`}
                        className="border-b border-stone-50 last:border-b-0"
                      >
                        <td className="py-2.5 pr-4 font-semibold text-stone-900">
                          {p.productName}
                          {p.variantName && (
                            <span className="text-stone-400"> · {p.variantName}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-stone-700">{p.unitsSold}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-orange-600">
                          {formatCLP(p.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </section>

          {/* SALES BY TABLE */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm">
            <h3 className="text-lg font-bold text-stone-900">Ventas por mesa</h3>
            {salesByTable.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">Sin ventas en el período.</p>
            ) : (
              <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-center">
                <div className="relative h-64 w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <Tooltip
                        formatter={(value) => formatCLP(typeof value === "number" ? value : Number(value ?? 0))}
                        contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      />
                      <Pie
                        data={salesByTableChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="90%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {salesByTableChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Legend
                        layout="vertical"
                        verticalAlign="middle"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Total</p>
                    <p className="text-lg font-extrabold tabular-nums text-stone-900">
                      {formatCLP(salesByTable.reduce((s, t) => s + t.revenue, 0))}
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-100 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                        <th className="pb-2 pr-4">Mesa</th>
                        <th className="pb-2 pr-4 text-right">Pedidos</th>
                        <th className="pb-2 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesByTable.map((t) => (
                        <tr key={t.tableId} className="border-b border-stone-50 last:border-b-0">
                          <td className="py-2.5 pr-4 font-semibold text-stone-900">
                            Mesa {t.tableNumber ?? t.tableId}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-stone-700">{t.orderCount}</td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-orange-600">
                            {formatCLP(t.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ADVANCED REPORTS (gated) */}
          {!canAdvanced ? (
            <section className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 text-2xl">
                🔒
              </div>
              <h3 className="mt-3 text-lg font-bold text-stone-900">
                Reportes avanzados y horas peak
              </h3>
              <p className="mt-1 text-sm text-stone-500">disponible en Plan 50+</p>
            </section>
          ) : (
            <>
              {/* PRODUCT MARGINS */}
              <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm">
                <h3 className="text-lg font-bold text-stone-900">Margen por producto</h3>
                {productMargins.length === 0 ? (
                  <p className="mt-3 text-sm text-stone-500">Sin datos en el período.</p>
                ) : (
                  <>
                    <div className="mt-4 w-full" style={{ height: Math.max(180, marginChartData.length * 32) }}>
                      <ResponsiveContainer>
                        <ComposedChart data={marginChartData} layout="vertical" margin={{ left: 8, right: 36 }}>
                          <ReferenceLine x={30} stroke="#a8a29e" strokeDasharray="4 4" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} unit="%" />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} interval={0} />
                          <Tooltip
                            formatter={(value) => `${value}%`}
                            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                            cursor={{ fill: "#fafaf9" }}
                          />
                          <Bar dataKey="marginPct" name="Margen" radius={[0, 6, 6, 0]} maxBarSize={18}>
                            {marginChartData.map((d, i) => (
                              <Cell key={i} fill={marginColor(d.marginPct)} />
                            ))}
                            <LabelList dataKey="marginPct" position="right" formatter={(v) => `${Number(v ?? 0)}%`} style={{ fontSize: 11, fontWeight: 700, fill: "#1c1917" }} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-[11px] text-stone-400">La línea punteada marca 30% de margen como referencia.</p>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-stone-100 text-left text-[11px] font-bold uppercase tracking-wider text-stone-500">
                            <th className="pb-2 pr-4">Producto</th>
                            <th className="pb-2 pr-4 text-right">Unidades</th>
                            <th className="pb-2 pr-4 text-right">Ingreso</th>
                            <th className="pb-2 pr-4 text-right">Costo</th>
                            <th className="pb-2 pr-4 text-right">Margen</th>
                            <th className="pb-2 text-right">Margen %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productMargins.map((m) => (
                            <tr
                              key={m.productName}
                              className="border-b border-stone-50 last:border-b-0"
                            >
                              <td className="py-2.5 pr-4 font-semibold text-stone-900">
                                {m.productName}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-stone-700">
                                {m.units}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-stone-700">
                                {formatCLP(m.revenue)}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums text-stone-700">
                                {formatCLP(m.totalCost)}
                              </td>
                              <td className="py-2.5 pr-4 text-right font-semibold tabular-nums text-stone-900">
                                {formatCLP(m.margin)}
                              </td>
                              <td
                                className={`py-2.5 text-right font-bold tabular-nums ${marginPctClass(
                                  m.marginPct,
                                )}`}
                              >
                                {Math.round(m.marginPct)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-xs text-stone-400">
                      El costo se calcula desde las recetas; productos sin receta muestran costo 0.
                    </p>
                  </>
                )}
              </section>

              {/* PEAK HOURS */}
              <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200 shadow-sm">
                <h3 className="text-lg font-bold text-stone-900">Horas peak</h3>
                <p className="mt-1 text-xs text-stone-500">Ingreso por hora del día</p>
                {peakHours.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-stone-500">Sin datos en el período.</p>
                ) : (
                  <>
                    <div className="mt-4 h-64 w-full">
                      <ResponsiveContainer>
                        <ComposedChart data={peakChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} />
                          <YAxis tick={{ fontSize: 11 }} stroke={CHART_AXIS_STROKE} />
                          <Tooltip content={<PeakTooltip />} cursor={{ fill: "#fafaf9" }} />
                          <Bar dataKey="revenue" name="revenue" radius={[6, 6, 0, 0]} maxBarSize={28}>
                            {peakChartData.map((d, i) => (
                              <Cell key={i} fill={d.hour === peakHourValue ? "#ea580c" : "#fdba74"} />
                            ))}
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {peakHourValue != null && (
                      <p className="mt-2 text-[11px] text-stone-400">
                        Hora de mayor venta: <span className="font-bold text-orange-600">{String(peakHourValue).padStart(2, "0")}:00</span>
                      </p>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
