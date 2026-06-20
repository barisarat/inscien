"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { SeriesCorrelationWidget } from "./AskClient"
import styles from "./Chart.module.css"

export default function SeriesCorrelationChart({ widget }: { widget: SeriesCorrelationWidget }) {
  const points = useMemo(
    () => (widget.points ?? []).filter((p) => p.x != null && p.y != null),
    [widget.points]
  )

  if (points.length === 0) return null

  const regLine = widget.regression
    ? [
        { x: widget.regression.x0, reg: widget.regression.y0 },
        { x: widget.regression.x1, reg: widget.regression.y1 },
      ]
    : []

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.labelA} <span className={styles.titleName}>vs {widget.labelB}</span>
        </span>
        <span className={styles.badge}>{widget.method}</span>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>r: <strong>{widget.r ?? "—"}</strong></span>
        <span className={styles.metric}>p: <strong>{widget.pValue ?? "—"}</strong></span>
        <span className={styles.metric}>n: <strong>{widget.n}</strong></span>
      </div>

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border-light)" />
            <XAxis
              type="number" dataKey="x" name={widget.labelA}
              tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--border)"
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2))}
            />
            <YAxis
              type="number" dataKey="y" name={widget.labelB} width={52}
              tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--border)"
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2))}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", fontSize: "var(--text-xs)", color: "var(--text)",
              }}
              labelStyle={{ color: "var(--text-2)" }}
            />
            <Scatter data={points} fill="var(--accent)" fillOpacity={0.55} isAnimationActive={false} />
            {regLine.length === 2 ? (
              <Line
                data={regLine} dataKey="reg" type="linear"
                stroke="var(--text-2)" strokeWidth={1.4} dot={false}
                isAnimationActive={false} legendType="none"
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {widget.note ? <div className={styles.note}>{widget.note}</div> : null}
    </div>
  )
}
