"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts"

type Props = {
  /** Id único (varias sparklines en la misma pantalla no pueden compartir el gradient). */
  id: string
  data: Array<Record<string, number | string>>
  dataKey: string
  color: string
  /** Formatea el valor mostrado en el tooltip al pasar el mouse. */
  formatValue?: (n: number) => string
  height?: number
}

function SparklineTooltip({
  active,
  payload,
  dataKey,
  formatValue,
}: {
  active?: boolean
  payload?: Array<{ payload: Record<string, number | string> }>
  dataKey: string
  formatValue?: (n: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const value = Number(payload[0].payload[dataKey] ?? 0)
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-stone-800 shadow-sm">
      {formatValue ? formatValue(value) : value}
    </div>
  )
}

/**
 * Mini gráfico de tendencia estilo tarjeta KPI de Power BI: sin ejes, sin
 * grid, solo la forma de la curva con relleno degradado. Pensado para vivir
 * al lado de un número grande, no como gráfico principal.
 */
export function Sparkline({ id, data, dataKey, color, formatValue, height = 40 }: Props) {
  if (data.length < 2) return null

  return (
    <div style={{ height }} className="w-full min-w-[80px]">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id={`sparkline-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={<SparklineTooltip dataKey={dataKey} formatValue={formatValue} />}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#sparkline-${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
