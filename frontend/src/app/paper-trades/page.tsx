"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import AppSidebar from "@/components/navigation/AppSidebar"
import EquityCurveChart from "@/components/strategies/EquityCurveChart"
import { useSidebar } from "@/lib/SidebarProvider"
import { useAuth } from "@/lib/auth"
import { useChatSidebar } from "@/lib/useChatSidebar"
import {
  type PaperRun,
  type PaperRunDetail,
  deletePaperRun,
  getPaperRun,
  listPaperRuns,
  pausePaperRun,
  restartPaperRun,
  startPaperRun,
  stopPaperRun,
} from "@/lib/api"
import { marketStatusFor } from "@/lib/market"
import { formatEt } from "@/lib/time"
import styles from "./page.module.css"

const POLL_MS = 15_000

function money(value: number | null | undefined) {
  if (value == null) return "—"
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active" ? styles.pillActive
    : status === "paused" ? styles.pillPaused
    : styles.pillStopped
  return <span className={`${styles.pill} ${cls}`}>{status}</span>
}

function awaitingFirstTick(run: PaperRun) {
  return run.status === "active" && !run.lastTickAt
}

function MarketPill({ ticker, now }: { ticker: string; now: Date }) {
  const market = marketStatusFor(ticker, now)
  return (
    <span className={`${styles.pill} ${market.open ? styles.pillActive : styles.pillStopped}`}>
      {market.label}
    </span>
  )
}

export default function PaperTradesPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const { contextItems: chatItems } = useChatSidebar()

  const [runs, setRuns] = useState<PaperRun[]>([])
  const [selectedRun, setSelectedRun] = useState<PaperRunDetail | null>(null)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const selectedRunIdRef = useRef<number | null>(null)

  // Wall clock for the per-run market pills; minute granularity is enough
  // for an open/closed flip.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login?next=/paper-trades"
    }
  }, [isLoading, isAuthenticated])

  const loadRuns = useCallback(async () => {
    try {
      const { runs } = await listPaperRuns()
      setRuns(runs)

      const selectedId = selectedRunIdRef.current
      if (selectedId != null) {
        const detail = await getPaperRun(selectedId)
        setSelectedRun(detail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs")
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    void loadRuns()
  }, [isAuthenticated, loadRuns])

  // Poll live run state; pause while the tab is hidden.
  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadRuns()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, loadRuns])

  const runAction = useCallback(async (id: number, fn: (id: number) => Promise<unknown>) => {
    setBusyId(id)
    setError("")
    try {
      await fn(id)
      await loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }, [loadRuns])

  const selectRun = useCallback(async (id: number) => {
    if (selectedRunIdRef.current === id) {
      selectedRunIdRef.current = null
      setSelectedRun(null)
      return
    }
    selectedRunIdRef.current = id
    try {
      setSelectedRun(await getPaperRun(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run")
    }
  }, [])

  if (isLoading || !isAuthenticated) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.loading}>Loading…</div>
      </div>
    )
  }

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/paper-trades"
        sectionTitle="Chats"
        contextItems={chatItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>Live Runs</h1>
            <p className={styles.desc}>
              Detailed live-test history. Start, pause, and publish saved tests from{" "}
              <Link href="/signals">Signals</Link>.
            </p>
          </header>

          {error ? <div className={styles.error}>{error}</div> : null}

          {runs.length === 0 ? (
            <p className={styles.empty}>
              No live-test runs yet. Save a Signal Test and flip its Live test switch on{" "}
              <Link href="/signals">Signals</Link>, or ask the chat to
              “live-test the energy news signal below -1.5 on QQQ”.
            </p>
          ) : (
            <div className={styles.runGrid}>
              {runs.map((run) => (
                <div key={run.id} className={styles.runCard}>
                  <div className={styles.runHead}>
                    <button className={styles.runTitle} onClick={() => selectRun(run.id)}>
                      {run.ticker} <span className={styles.runSub}>{run.rule}{run.params?.threshold != null ? ` @ ${run.params.threshold}` : ""}</span>
                    </button>
                    <span className={styles.headPills}>
                      <MarketPill ticker={run.ticker} now={now} />
                      {awaitingFirstTick(run)
                        ? <span className={`${styles.pill} ${styles.pillPaused}`}>awaiting first tick</span>
                        : <StatusPill status={run.status} />}
                    </span>
                  </div>

                  <div className={styles.metricRow}>
                    <span className={styles.metric}>Equity <strong>{money(run.equity)}</strong></span>
                    <span className={`${styles.metric} ${(run.returnPct ?? 0) >= 0 ? styles.pos : styles.neg}`}>
                      Return <strong>{pct(run.returnPct)}</strong>
                    </span>
                    <span className={styles.metric}>{run.frequency}</span>
                  </div>

                  <div className={styles.metricRow}>
                    <span className={styles.metric}>Started <strong>{formatEt(run.startedAt)}</strong></span>
                    <span className={styles.metric}>Last tick <strong>{formatEt(run.lastTickAt)}</strong></span>
                  </div>

                  {run.note ? <div className={styles.note}>{run.note}</div> : null}

                  <div className={styles.actions}>
                    {run.status === "paused" ? (
                      <button disabled={busyId === run.id} className={styles.btn}
                        onClick={() => runAction(run.id, startPaperRun)}>Resume</button>
                    ) : null}
                    {run.status === "active" ? (
                      <button disabled={busyId === run.id} className={styles.btn}
                        onClick={() => runAction(run.id, pausePaperRun)}>Pause</button>
                    ) : null}
                    {run.status !== "stopped" ? (
                      <button disabled={busyId === run.id} className={styles.btn}
                        onClick={() => runAction(run.id, stopPaperRun)}>Stop</button>
                    ) : null}
                    <button disabled={busyId === run.id} className={styles.btn}
                      onClick={() => runAction(run.id, restartPaperRun)}>Restart</button>
                    <button disabled={busyId === run.id} className={`${styles.btn} ${styles.btnDanger}`}
                      onClick={() => runAction(run.id, deletePaperRun)}>Delete</button>
                  </div>

                  {selectedRun?.id === run.id ? (
                    <div className={styles.detail}>
                      {selectedRun.ticks.length === 0 ? (
                        <span className={styles.empty}>
                          No ticks yet — the wealth curve starts with the first bar after start.
                        </span>
                      ) : (
                        <EquityCurveChart
                          points={selectedRun.ticks.map((t) => ({ ts: t.ts, equity: t.equity }))}
                          frequency={selectedRun.frequency}
                          easternTime
                        />
                      )}
                      <div className={styles.tradeList}>
                        {selectedRun.trades.length === 0 ? (
                          <span className={styles.empty}>No trades yet.</span>
                        ) : (
                          selectedRun.trades.slice(-8).reverse().map((t, i) => (
                            <div key={i} className={styles.tradeRow}>
                              <span className={t.side === "buy" ? styles.pos : styles.neg}>{t.side}</span>
                              <span>{t.qty} @ {money(t.price)}</span>
                              <span className={styles.tradeTs}>{formatEt(t.ts)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
