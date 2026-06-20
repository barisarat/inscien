"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { VolSeriesWidget } from "./AskClient"
import styles from "./Chart.module.css"
import { FREQ_LABELS, formatTick } from "./chartFormat"

// Annualized realized-vol regime bands (percent). Daily only — calibrated to
// daily vol, so intraday charts omit them. Background context only — rendered
// in neutral tints, never accent.
const REGIME_BANDS: { label: string; low: number; high: number; fill: string }[] = [
  { label: "Low", low: 0, high: 12, fill: "rgba(148, 163, 184, 0.05)" },
  { label: "Normal", low: 12, high: 18, fill: "rgba(148, 163, 184, 0.10)" },
  { label: "Elevated", low: 18, high: 25, fill: "rgba(148, 163, 184, 0.16)" },
  { label: "High", low: 25, high: 35, fill: "rgba(148, 163, 184, 0.22)" },
  { label: "Crisis", low: 35, high: 200, fill: "rgba(148, 163, 184, 0.30)" },
]

function formatVol(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`
}

export default function VolSeriesChart({ widget }: { widget: VolSeriesWidget }) {
  const intraday = widget.frequency != null && widget.frequency !== "1day"
  // Regime bands are daily-calibrated; only present (and shown) at 1day.
  const hasRegime = Boolean(widget.regime)
  const winUnit = intraday ? "-bar" : "d"
  const { data, maxVol } = useMemo(() => {
    const byDate = new Map<string, { date: string; short?: number; long?: number }>()

    for (const point of widget.shortSeries) {
      byDate.set(point.date, { date: point.date, short: point.vol })
    }
    for (const point of widget.longSeries) {
      const existing = byDate.get(point.date) ?? { date: point.date }
      existing.long = point.vol
      byDate.set(point.date, existing)
    }

    const merged = Array.from(byDate.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    )

    const max = merged.reduce((acc, row) => {
      return Math.max(acc, row.short ?? 0, row.long ?? 0)
    }, 0)

    return { data: merged, maxVol: max }
  }, [widget.shortSeries, widget.longSeries])

  if (data.length === 0) return null

  const yMax = Math.ceil((maxVol + 4) / 5) * 5
  const visibleBands = hasRegime ? REGIME_BANDS.filter((band) => band.low < yMax) : []
  const badge = hasRegime
    ? `${widget.regime} regime`
    : FREQ_LABELS[widget.frequency ?? ""] ?? widget.frequency

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.ticker} <span className={styles.titleName}>volatility</span>
        </span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>
          {widget.shortWindow}{winUnit}: <strong>{formatVol(widget.currentShortVol)}</strong>
        </span>
        {widget.currentLongVol != null ? (
          <span className={styles.metric}>
            {widget.longWindow}{winUnit}: <strong>{formatVol(widget.currentLongVol)}</strong>
          </span>
        ) : null}
      </div>

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {visibleBands.map((band) => (
              <ReferenceArea
                key={band.label}
                y1={band.low}
                y2={Math.min(band.high, yMax)}
                fill={band.fill}
                fillOpacity={1}
                ifOverflow="hidden"
                stroke="none"
              />
            ))}
            <CartesianGrid stroke="var(--border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatTick(v, intraday)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              domain={[0, yMax]}
              width={44}
              tickFormatter={(value: number) => `${value}%`}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatVol(value),
                name === "short"
                  ? `${widget.shortWindow}${winUnit} vol`
                  : `${widget.longWindow}${winUnit} vol`,
              ]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--text)",
              }}
              labelStyle={{ color: "var(--text-2)" }}
            />
            <Line
              type="monotone"
              dataKey="short"
              stroke="var(--accent)"
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="long"
              stroke="var(--text-2)"
              strokeWidth={1.4}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
