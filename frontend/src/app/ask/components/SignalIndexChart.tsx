"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { SignalIndexWidget } from "./AskClient"
import styles from "./Chart.module.css"
import { formatLabel, formatTick } from "./chartFormat"

const COLORS = ["var(--source-green)", "var(--source-purple)", "var(--source-amber)", "var(--accent)"]

export default function SignalIndexChart({ widget }: { widget: SignalIndexWidget }) {
  const series = widget.series ?? []

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
    widget.frequency,
    widget.breakdown ? `by ${widget.breakdown}` : "",
    series.length > 1 ? `${series.length} series` : "",
  ]
    .filter(Boolean)
    .join(" · ")

  const showLegend = series.length > 1
  const topEvents = widget.topEvents ?? []

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.label} <span className={styles.titleName}>sentiment index</span>
        </span>
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
              tickFormatter={(v: string) => formatTick(v, false)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              domain={["auto", "auto"]}
              width={40}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <Tooltip
              labelFormatter={(v: string) => formatLabel(v, false)}
              formatter={(value: number, key: string) => {
                const idx = Number(String(key).slice(1))
                return [value, series[idx]?.label ?? key]
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

      {topEvents.length > 0 ? (
        <div className={styles.events}>
          {topEvents.slice(0, 5).map((e, i) => (
            <span key={i} className={styles.event}>
              <span className={styles.eventDate}>{e.date}</span>
              {e.title}
            </span>
          ))}
        </div>
      ) : null}

      {widget.meta?.note ? <div className={styles.note}>{widget.meta.note}</div> : null}
    </div>
  )
}
