"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { SeriesPlotWidget } from "./AskClient"
import styles from "./Chart.module.css"
import { FREQ_LABELS, formatLabel, formatTick, rangeBadgeLabel } from "./chartFormat"

const COLORS = ["var(--source-green)", "var(--source-purple)", "var(--source-amber)", "var(--accent)"]

function formatValue(value: number, format?: string) {
  if (format === "currency") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  if (format === "percent") return `${(value * 100).toFixed(2)}%`
  return value
}

export default function SeriesPlotChart({ widget }: { widget: SeriesPlotWidget }) {
  const series = widget.series ?? []
  const intraday = widget.frequency != null && widget.frequency !== "1day"

  // One axis can only carry one unit: format ticks only when every series agrees.
  const sharedFormat =
    series.length > 0 && series[0].format && series.every((s) => s.format === series[0].format)
      ? series[0].format
      : undefined

  const single = series.length === 1 ? series[0] : null
  const hasAssetHeader = Boolean(single?.ticker)
  // For a plain single-asset chart the legend repeats the header; keep it when a
  // transform is applied so the view ("% change", "rebased to 100") stays visible.
  const showLegend =
    !hasAssetHeader || (single?.transform != null && single.transform !== "none")

  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    series.forEach((s, i) => {
      for (const p of s.points ?? []) {
        if (p.value == null) continue
        const row = byDate.get(p.date) ?? { date: p.date }
        row[`s${i}`] = p.value
        byDate.set(p.date, row)
      }
    })
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0
    )
  }, [series])

  if (series.length === 0 || data.length === 0) return null

  const badge = [
    series.length > 1 ? `${series.length} series` : "",
    rangeBadgeLabel(widget.range, widget.start, widget.end),
    intraday ? FREQ_LABELS[widget.frequency!] ?? widget.frequency : "",
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        {hasAssetHeader ? (
          <span className={styles.title}>
            {single!.ticker} <span className={styles.titleName}>{single!.name ?? ""}</span>
          </span>
        ) : (
          <span className={styles.title}>Series plot</span>
        )}
        <span className={styles.badge}>{badge}</span>
      </div>

      {showLegend ? (
        <div className={styles.legend}>
          {series.map((s, i) => (
            <span key={i} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: COLORS[i % COLORS.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatTick(v, intraday)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={
                sharedFormat ? (v: number) => String(formatValue(v, sharedFormat)) : undefined
              }
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <Tooltip
              labelFormatter={(v: string) => formatLabel(v, intraday)}
              formatter={(value: number, key: string) => {
                const idx = Number(String(key).slice(1))
                return [formatValue(value, series[idx]?.format), series[idx]?.label ?? key]
              }}
              contentStyle={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", fontSize: "var(--text-xs)", color: "var(--text)",
              }}
              labelStyle={{ color: "var(--text-2)" }}
            />
            {series.map((s, i) => (
              <Line
                key={i} type="monotone" dataKey={`s${i}`}
                stroke={COLORS[i % COLORS.length]} strokeWidth={1.6}
                dot={false} connectNulls isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {widget.note ? <div className={styles.note}>{widget.note}</div> : null}
    </div>
  )
}
