"use client"

import Link from "next/link"
import type { PaperRunStartedWidget } from "./AskClient"
import styles from "./Chart.module.css"

function money(value: number | null | undefined) {
  if (value == null) return "—"
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function PaperRunStartedCard({ widget }: { widget: PaperRunStartedWidget }) {
  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.ticker} <span className={styles.titleName}>{widget.strategyLabel}</span>
        </span>
        <span className={styles.badge}>{widget.status}</span>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>Run <strong>#{widget.runId}</strong></span>
        <span className={styles.metric}>Starting cash <strong>{money(widget.startingCash)}</strong></span>
        {widget.frequency ? (
          <span className={styles.metric}>Frequency <strong>{widget.frequency}</strong></span>
        ) : null}
      </div>

      <div className={styles.note}>
        Live test running. Track it on <Link href="/signals">Signals</Link>.
      </div>
    </div>
  )
}
