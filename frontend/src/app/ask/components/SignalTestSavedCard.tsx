"use client"

import Link from "next/link"
import type { SignalTestSavedWidget } from "./AskClient"
import styles from "./Chart.module.css"

const METRIC_LABELS: Record<string, string> = {
  totalReturnPct: "Return",
  cagrPct: "CAGR",
  sharpe: "Sharpe",
  maxDrawdownPct: "Max DD",
  winRate: "Win rate",
  numTrades: "Trades",
}

function formatValue(key: string, value: number | string) {
  if (typeof value !== "number") return String(value)
  if (key.endsWith("Pct") || key === "winRate") return `${value.toFixed(2)}%`
  return String(value)
}

export default function SignalTestSavedCard({ widget }: { widget: SignalTestSavedWidget }) {
  const backtest = widget.validation?.newsBacktest ?? widget.validation?.backtestReport
  const metrics = Object.entries(backtest?.metrics ?? {})

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.name}{" "}
          <span className={styles.titleName}>
            {widget.ticker}
            {widget.frequency ? ` · ${widget.frequency}` : ""}
          </span>
        </span>
        <span className={styles.badge}>signal test saved</span>
      </div>

      {metrics.length > 0 ? (
        <div className={styles.metrics}>
          {metrics.map(([k, v]) => (
            <span key={k} className={styles.metric}>
              {METRIC_LABELS[k] || k} <strong>{formatValue(k, v)}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.note}>
        Saved to your <Link href="/signals">Signals</Link> — start a live test (threshold rule)
        when you are ready. The captured backtest preserves test context; it does not prove the signal.
      </div>
    </div>
  )
}
