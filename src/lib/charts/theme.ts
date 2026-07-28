/**
 * Paleta y estilos compartidos por los gráficos de Recharts del panel admin,
 * para que todos los charts (Reportes, dashboard) se vean como parte del
 * mismo sistema visual en vez de reinventar colores por gráfico.
 */
import type { CSSProperties } from "react"

export const CHART_PALETTE = [
  "#f97316", // naranja (marca)
  "#0ea5e9", // sky
  "#22c55e", // esmeralda
  "#a855f7", // violeta
  "#eab308", // ámbar
  "#ef4444", // rojo
  "#14b8a6", // teal
  "#6366f1", // índigo
]

export function marginColor(pct: number): string {
  if (pct >= 50) return "#16a34a"
  if (pct >= 20) return "#d97706"
  return "#dc2626"
}

export const CHART_GRID_STROKE = "#e7e5e4"
export const CHART_AXIS_STROKE = "#78716c"

export const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e7e5e4",
  boxShadow: "0 8px 24px -8px rgba(28,25,23,0.18)",
  fontSize: 12,
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "#1c1917",
  fontWeight: 700,
  marginBottom: 4,
}

/** "+12,3%" / "-4,0%" / "—" (sin base para comparar). */
export function formatPctChange(curr: number, prev: number): string {
  if (prev === 0) return curr === 0 ? "0%" : "+100%"
  const pct = ((curr - prev) / prev) * 100
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`
}

export function pctChangeDirection(curr: number, prev: number): "up" | "down" | "flat" {
  if (curr === prev) return "flat"
  return curr > prev ? "up" : "down"
}
