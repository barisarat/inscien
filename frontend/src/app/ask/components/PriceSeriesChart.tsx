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
import type { PriceSeriesWidget } from "./AskClient"
import styles from "./Chart.module.css"
import { FREQ_LABELS, formatLabel, formatTick, rangeBadgeLabel } from "./chartFormat"

function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function PriceSeriesChart({ widget }: { widget: PriceSeriesWidget }) {
  const data = useMemo(
    () => widget.points.filter((point) => point.close != null),
    [widget.points]
  )

  if (data.length === 0) return null

  const intraday = widget.frequency != null && widget.frequency !== "1day"
  const rangeLabel = rangeBadgeLabel(widget.range, widget.start, widget.end)
  const badge = intraday
    ? `${rangeLabel} · ${FREQ_LABELS[widget.frequency!] ?? widget.frequency}`
    : rangeLabel

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.ticker} <span className={styles.titleName}>{widget.name}</span>
        </span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatTick(value, intraday)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={(value: number) => formatPrice(value)}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <Tooltip
              formatter={(value: number) => [formatPrice(value), "Close"]}
              labelFormatter={(value: string) => formatLabel(value, intraday)}
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
              dataKey="close"
              stroke="var(--accent)"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {widget.note ? <div className={styles.note}>{widget.note}</div> : null}
    </div>
  )
}
