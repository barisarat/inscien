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
import type { NewsIndexWidget } from "./AskClient"
import styles from "./Chart.module.css"

const SENTIMENT_LABELS: Record<string, string> = {
  tone: "tone", nsi: "net sentiment", counts: "volume (z)", polarity: "polarity",
}

const FREQ_LABELS: Record<string, string> = { "60min": "hourly", "15min": "15-minute", "5min": "5-minute" }

function formatTs(value: string, intraday: boolean, compact: boolean) {
  const text = value ?? ""
  if (intraday) return text.slice(5, 16).replace("T", " ")
  return compact ? text.slice(0, 7) : text.slice(0, 10)
}

export default function NewsIndexChart({ widget }: { widget: NewsIndexWidget }) {
  const data = useMemo(
    () => (widget.indexSeries ?? []).filter((p) => p.valueSmoothed != null),
    [widget.indexSeries]
  )

  if (data.length === 0) return null

  const meta = widget.meta
  const sentiment = SENTIMENT_LABELS[widget.sentimentType] ?? widget.sentimentType
  const intraday = widget.frequency != null && widget.frequency !== "1day"
  const badge = intraday
    ? `${sentiment} · ${FREQ_LABELS[widget.frequency!] ?? widget.frequency}`
    : sentiment

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.scopeLabel} <span className={styles.titleName}>news index</span>
        </span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>Days: <strong>{meta.daysCovered}</strong></span>
        <span className={styles.metric}>Articles: <strong>{meta.totalArticles.toLocaleString()}</strong></span>
        <span className={styles.metric}>Avg/day: <strong>{meta.avgArticlesPerDay}</strong></span>
        {intraday ? (
          <span className={styles.metric}>Window: <strong>trailing {widget.windowHours ?? 24}h</strong></span>
        ) : (
          <span className={styles.metric}>Smoothing: <strong>{widget.smoothing}d</strong></span>
        )}
      </div>

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatTs(v, intraday, true)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis
              domain={["auto", "auto"]}
              width={52}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <Tooltip
              formatter={(value: number) => [value.toFixed(3), "index"]}
              labelFormatter={(v: string) => formatTs(v, intraday, false)}
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
              dataKey="valueSmoothed"
              stroke="var(--accent)"
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {widget.note ? <div className={styles.note}>{widget.note}</div> : null}
    </div>
  )
}
