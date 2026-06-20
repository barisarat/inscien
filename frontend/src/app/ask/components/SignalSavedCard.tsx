"use client"

import Link from "next/link"
import type { SignalSavedWidget } from "./AskClient"
import styles from "./Chart.module.css"

const KIND_LABELS: Record<string, string> = {
  seriesCorrelation: "correlation",
  coverage: "coverage",
}

export default function SignalSavedCard({ widget }: { widget: SignalSavedWidget }) {
  const captured = Object.keys(widget.validation ?? {}).map((k) => KIND_LABELS[k] || k)

  return (
    <div className={styles.widget}>
      <div className={styles.header}>
        <span className={styles.title}>
          {widget.name}{" "}
          <span className={styles.titleName}>
            {widget.scope || widget.signalType || "signal"}
          </span>
        </span>
        <span className={styles.badge}>signal saved</span>
      </div>

      {captured.length > 0 ? (
        <div className={styles.metrics}>
          {captured.map((c) => (
            <span key={c} className={styles.metric}>{c}</span>
          ))}
        </div>
      ) : null}

      <div className={styles.note}>
        Saved to your <Link href="/signals">Signals</Link> — add a Signal Test (a trading rule)
        and live-test it. Saved evidence preserves test context; it does not prove the signal.
      </div>
    </div>
  )
}
