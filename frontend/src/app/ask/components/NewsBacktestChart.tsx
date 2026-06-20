"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import EquityCurveChart from "@/components/strategies/EquityCurveChart"
import type { NewsBacktestWidget } from "./AskClient"
import styles from "./Chart.module.css"

function pct(value: number | undefined) {
  if (value == null) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function corr(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(3)
}

const FREQ_LABELS: Record<string, string> = { "60min": "hourly", "15min": "15-minute", "5min": "5-minute" }

function formatTs(value: string, intraday: boolean, compact: boolean) {
  const text = value ?? ""
  if (intraday) return text.slice(5, 16).replace("T", " ")
  return compact ? text.slice(0, 7) : text.slice(0, 10)
}

export default function NewsBacktestChart({ widget }: { widget: NewsBacktestWidget }) {
  const m = widget.metrics ?? {}
  const intraday = widget.frequency != null && widget.frequency !== "1day"
  const badge = intraday
    ? `${widget.sentimentType} · ${FREQ_LABELS[widget.frequency!] ?? widget.frequency} · trailing ${widget.windowHours ?? 24}h`
    : widget.sentimentType

  // Merge index (smoothed) + ETF price onto one date axis for the overlay.
  const overlay = useMemo(() => {
    const byDate = new Map<string, { date: string; index?: number | null; close?: number }>()
    for (const p of widget.indexSeries ?? []) {
      byDate.set(p.date, { date: p.date, index: p.valueSmoothed })
    }
    for (const p of widget.priceSeries ?? []) {
      const row = byDate.get(p.date) ?? { date: p.date }
      row.close = p.close
      byDate.set(p.date, row)
    }
    return Array.from(byDate.values()).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    )
  }, [widget.indexSeries, widget.priceSeries])

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.ticker} <span className={styles.titleName}>{widget.scopeLabel} news signal</span>
        </span>
        <span className={styles.badge}>{badge}</span>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>Return: <strong>{pct(m.totalReturnPct)}</strong></span>
        <span className={styles.metric}>CAGR: <strong>{pct(m.cagrPct)}</strong></span>
        <span className={styles.metric}>Sharpe: <strong>{m.sharpe ?? "—"}</strong></span>
        <span className={styles.metric}>Max DD: <strong>{pct(m.maxDrawdownPct)}</strong></span>
        <span className={styles.metric}>Trades: <strong>{m.numTrades ?? "—"}</strong></span>
        <span className={styles.metric}>Corr (lag1): <strong>{corr(widget.correlations?.lag1)}</strong></span>
      </div>

      <div className={styles.chart}>
        <EquityCurveChart points={widget.equityCurve ?? []} frequency={widget.frequency} />
      </div>

      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={overlay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatTs(v, intraday, true)}
              minTickGap={48}
              tick={{ fill: "var(--text-3)", fontSize: 11 }}
              stroke="var(--border)"
            />
            <YAxis yAxisId="idx" width={44} tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--border)" />
            <YAxis yAxisId="px" orientation="right" width={52} tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--border)" />
            <Tooltip
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
            <Line yAxisId="idx" type="monotone" dataKey="index" name="news index"
                  stroke="var(--accent)" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
            <Line yAxisId="px" type="monotone" dataKey="close" name={widget.ticker}
                  stroke="var(--text-2)" strokeWidth={1.2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--accent)" }} />news index</span>
        <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--text-2)" }} />{widget.ticker} price</span>
      </div>

      {widget.note ? <div className={styles.note}>{widget.note}</div> : null}
    </div>
  )
}
