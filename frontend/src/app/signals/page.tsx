"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import AppSidebar from "@/components/navigation/AppSidebar"
import EquityCurveChart from "@/components/strategies/EquityCurveChart"
import { useSidebar } from "@/lib/SidebarProvider"
import { useAuth } from "@/lib/auth"
import { useChatSidebar } from "@/lib/useChatSidebar"
import {
  type PaperRunDetail,
  type SavedSignal,
  type SavedSignalTest,
  type ValidationSnapshot,
  deleteSignal,
  deleteSignalTest,
  getPaperRun,
  listSignals,
  pausePaperRun,
  publicApiUrl,
  publishSignalTest,
  restartPaperRun,
  startPaperRun,
  startSignalTestPaperRun,
  stopPaperRun,
  unpublishSignalTest,
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

const VALIDATION_TYPE_LABELS: Record<string, string> = {
  newsBacktest: "Backtest",
  backtestReport: "Backtest",
  seriesCorrelation: "Correlation",
  coverage: "Coverage",
}

const METRIC_LABELS: Record<string, string> = {
  totalReturnPct: "Return",
  cagrPct: "CAGR",
  sharpe: "Sharpe",
  maxDrawdownPct: "Max DD",
  winRate: "Win rate",
  numTrades: "Trades",
  r: "r",
  pValue: "p-value",
  n: "n",
  method: "Method",
  daysCovered: "Days",
  totalArticles: "Articles",
  avgArticlesPerDay: "Avg/day",
}

function formatMetricValue(key: string, value: number | string) {
  if (typeof value !== "number") return String(value)
  if (key.endsWith("Pct") || key === "winRate") return `${value.toFixed(2)}%`
  return String(value)
}

function validationWindowText(snapshot: ValidationSnapshot) {
  const w = snapshot.window
  if (!w) return ""
  if (w.range) return w.range
  if (w.start && w.end) return `${w.start} → ${w.end}`
  return w.start || ""
}

function signalTestApiBase(test: SavedSignalTest) {
  if (test.publicId) return publicApiUrl(`/api/v1/signal-tests/${test.publicId}`)
  return null
}

function rerunQuery(signal: SavedSignal, test?: SavedSignalTest): string {
  const scope = signal.scope || signal.name
  if (test) {
    const thr = test.threshold != null ? ` at threshold ${test.threshold}` : ""
    return `Rerun the ${scope} ${test.rule} signal${thr} on ${test.ticker} (${test.frequency})`
  }
  return `Show the ${scope} news index and its correlation`
}

function ValidationBlock({ snapshot }: { snapshot: ValidationSnapshot }) {
  const metrics = Object.entries(snapshot.metrics ?? {})
  const windowText = validationWindowText(snapshot)
  const isCoverage = snapshot.type === "coverage"
  const subject = snapshot.asset || snapshot.label
  let captured = ""
  try {
    captured = snapshot.capturedAt ? new Date(snapshot.capturedAt).toLocaleDateString() : ""
  } catch {
    captured = ""
  }
  return (
    <div className={styles.validationBlock}>
      <div className={styles.validationHead}>
        <span className={styles.validationLabel}>
          {VALIDATION_TYPE_LABELS[snapshot.type] || "Validation"}
        </span>
        <span className={styles.validationOn}>
          {isCoverage
            ? "Article coverage"
            : `Validated${subject ? ` on ${subject}` : ""}${windowText ? ` over ${windowText}` : ""}`}
          {captured ? ` · ${captured}` : ""}
        </span>
      </div>
      {metrics.length > 0 ? (
        <div className={styles.metricRow}>
          {metrics.map(([k, v]) => (
            <span key={k} className={styles.metric}>
              {METRIC_LABELS[k] || k} <strong>{formatMetricValue(k, v)}</strong>
            </span>
          ))}
        </div>
      ) : null}
      {snapshot.chart && snapshot.chart.length > 1 ? (
        <EquityCurveChart points={snapshot.chart} frequency={snapshot.frequency || "1day"} height={140} />
      ) : null}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status.includes("running") || status === "validated" || status === "API published" ? styles.pillActive
    : status.includes("paused") ? styles.pillPaused
    : styles.pillStopped
  return <span className={`${styles.pill} ${cls}`}>{status}</span>
}

function liveStatusFor(test: SavedSignalTest) {
  if (!test.activeRun) return "off"
  return test.activeRun.status === "active" ? "running" : test.activeRun.status
}

function awaitingFirstTick(run: PaperRunDetail) {
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

export default function SignalsPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const { contextItems: chatItems } = useChatSidebar()

  const [signals, setSignals] = useState<SavedSignal[]>([])
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [selectedRun, setSelectedRun] = useState<PaperRunDetail | null>(null)
  const [apiOpenId, setApiOpenId] = useState<number | null>(null)
  const [copiedKey, setCopiedKey] = useState("")
  const selectedRunIdRef = useRef<number | null>(null)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login?next=/signals"
    }
  }, [isLoading, isAuthenticated])

  const load = useCallback(async () => {
    try {
      const { signals } = await listSignals()
      setSignals(signals)
      const selectedId = selectedRunIdRef.current
      if (selectedId != null) {
        setSelectedRun(await getPaperRun(selectedId))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load signals")
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    void load()
  }, [isAuthenticated, load])

  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, load])

  const toggleLiveTest = useCallback(async (test: SavedSignalTest) => {
    setBusyId(test.id)
    setError("")
    try {
      if (test.activeRun && test.activeRun.status === "active") {
        await stopPaperRun(test.activeRun.id)
        if (selectedRunIdRef.current === test.activeRun.id) {
          selectedRunIdRef.current = null
          setSelectedRun(null)
        }
      } else {
        await startSignalTestPaperRun(test.id)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }, [load])

  const runAction = useCallback(async (id: number, fn: (id: number) => Promise<unknown>) => {
    setBusyId(id)
    setError("")
    try {
      await fn(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }, [load])

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
      setError(err instanceof Error ? err.message : "Failed to load live test")
    }
  }, [])

  const togglePublish = useCallback(async (test: SavedSignalTest) => {
    setBusyId(test.id)
    setError("")
    try {
      if (test.isPublished) {
        await unpublishSignalTest(test.id)
        setApiOpenId((cur) => (cur === test.id ? null : cur))
      } else {
        await publishSignalTest(test.id)
        setApiOpenId(test.id)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }, [load])

  const copyText = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((cur) => (cur === key ? "" : cur)), 2000)
    } catch {
      setCopiedKey("")
    }
  }, [])

  const removeTest = useCallback(async (testId: number) => {
    setBusyId(testId)
    setError("")
    try {
      await deleteSignalTest(testId)
      if (selectedRun?.signalTestId === testId) {
        selectedRunIdRef.current = null
        setSelectedRun(null)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setBusyId(null)
    }
  }, [load, selectedRun?.signalTestId])

  const removeSignal = useCallback(async (id: number) => {
    setBusyId(id)
    setError("")
    try {
      await deleteSignal(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setBusyId(null)
    }
  }, [load])

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
        brandHref="/signals"
        sectionTitle="Chats"
        contextItems={chatItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>Signals</h1>
            <p className={styles.desc}>
              Saved news signals with their validation evidence, trading rules (Signal Tests),
              live tests, and API export — in one cockpit.
            </p>
          </header>

          {error ? <div className={styles.error}>{error}</div> : null}

          {signals.length === 0 ? (
            <p className={styles.empty}>
              No saved signals yet. Build a news signal in chat, validate it, then ask FinanceLab
              to save it — and to save a trading rule on it as a Signal Test.
            </p>
          ) : (
            <div className={styles.runGrid}>
              {signals.map((s) => {
                const signalValidations = Object.values(s.validation ?? {})
                const validated = signalValidations.length > 0
                return (
                  <div key={s.id} className={styles.runCard}>
                    <div className={styles.runHead}>
                      <div>
                        <div className={styles.runTitle}>{s.name}</div>
                        <div className={styles.runSub}>
                          {(s.scope || s.signalType)} · {s.sentimentType}
                        </div>
                      </div>
                      <span className={styles.headPills}>
                        <StatusPill status={validated ? "validated" : "not validated"} />
                        <StatusPill status={`${s.tests.length} test${s.tests.length === 1 ? "" : "s"}`} />
                      </span>
                    </div>

                    {validated ? (
                      <div className={styles.validation}>
                        {signalValidations.map((snap) => (
                          <ValidationBlock key={snap.type} snapshot={snap} />
                        ))}
                      </div>
                    ) : null}

                    <div className={styles.actions}>
                      <Link href={`/ask?q=${encodeURIComponent(rerunQuery(s))}`} className={styles.btn}>
                        Open in chat
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === s.id}
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={() => removeSignal(s.id)}
                      >
                        Delete signal
                      </button>
                    </div>

                    {/* Signal Tests under this signal */}
                    {s.tests.length === 0 ? (
                      <div className={styles.detail}>
                        <span className={styles.empty}>
                          No Signal Tests yet. In chat, backtest a rule on this signal and save it as a Signal Test.
                        </span>
                      </div>
                    ) : (
                      s.tests.map((t) => {
                        const liveStatus = liveStatusFor(t)
                        const selectedThisRun = t.activeRun && selectedRun?.id === t.activeRun.id ? selectedRun : null
                        const apiBase = signalTestApiBase(t)
                        const testValidations = Object.values(t.validation ?? {})
                        return (
                          <div key={t.id} className={styles.detail}>
                            <div className={styles.detailHeader}>
                              <div className={styles.sectionLabel}>{t.name}</div>
                              <span className={styles.headPills}>
                                <StatusPill status={`live ${liveStatus}`} />
                                <StatusPill status={t.isPublished ? "API published" : "API off"} />
                              </span>
                            </div>

                            <div className={styles.summaryGrid}>
                              <span className={styles.summaryItem}>Asset <strong>{t.ticker}</strong></span>
                              <span className={styles.summaryItem}>
                                Rule <strong>{t.rule}{t.threshold != null ? ` @ ${t.threshold}` : ""}</strong>
                              </span>
                              <span className={styles.summaryItem}>Frequency <strong>{t.frequency}</strong></span>
                            </div>

                            {t.activeRun ? (
                              <div className={styles.liveSummary}>
                                <span>Equity <strong>{money(t.activeRun.equity)}</strong></span>
                                <span className={(t.activeRun.returnPct ?? 0) >= 0 ? styles.pos : styles.neg}>
                                  Return <strong>{pct(t.activeRun.returnPct)}</strong>
                                </span>
                              </div>
                            ) : null}

                            {testValidations.length > 0 ? (
                              <div className={styles.validation}>
                                {testValidations.map((snap) => (
                                  <ValidationBlock key={snap.type} snapshot={snap} />
                                ))}
                              </div>
                            ) : null}

                            <div className={styles.actions}>
                              {t.rule === "threshold" ? (
                                !t.activeRun ? (
                                  <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    onClick={() => toggleLiveTest(t)}
                                    disabled={busyId === t.id}
                                  >
                                    Start live test
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    onClick={() => void selectRun(t.activeRun!.id)}
                                  >
                                    {selectedThisRun ? "Hide history" : "Inspect history"}
                                  </button>
                                )
                              ) : (
                                <span className={styles.note}>Live tests support the threshold rule only.</span>
                              )}

                              <Link href={`/ask?q=${encodeURIComponent(rerunQuery(s, t))}`} className={styles.btn}>
                                Rerun in chat
                              </Link>

                              {!t.isPublished ? (
                                <button
                                  type="button"
                                  className={styles.btn}
                                  onClick={() => togglePublish(t)}
                                  disabled={busyId === t.id}
                                >
                                  Publish API
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={styles.btn}
                                    onClick={() => setApiOpenId(apiOpenId === t.id ? null : t.id)}
                                  >
                                    {apiOpenId === t.id ? "Hide endpoints" : "API endpoints"}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btn}
                                    onClick={() => togglePublish(t)}
                                    disabled={busyId === t.id}
                                  >
                                    Unpublish API
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                disabled={busyId === t.id}
                                className={`${styles.btn} ${styles.btnDanger}`}
                                onClick={() => removeTest(t.id)}
                              >
                                Delete test
                              </button>
                            </div>

                            {selectedThisRun ? (
                              <div className={styles.detail}>
                                <div className={styles.detailHeader}>
                                  <div className={styles.sectionLabel}>Live history</div>
                                  <span className={styles.headPills}>
                                    <MarketPill ticker={selectedThisRun.ticker} now={now} />
                                    {awaitingFirstTick(selectedThisRun)
                                      ? <span className={`${styles.pill} ${styles.pillPaused}`}>awaiting first tick</span>
                                      : <StatusPill status={selectedThisRun.status === "active" ? "running" : selectedThisRun.status} />}
                                  </span>
                                </div>

                                <div className={styles.metricRow}>
                                  <span className={styles.metric}>Started <strong>{formatEt(selectedThisRun.startedAt)}</strong></span>
                                  <span className={styles.metric}>Last tick <strong>{formatEt(selectedThisRun.lastTickAt)}</strong></span>
                                  <span className={styles.metric}>Last price <strong>{money(selectedThisRun.lastPrice)}</strong></span>
                                </div>

                                {selectedThisRun.note ? <div className={styles.note}>{selectedThisRun.note}</div> : null}

                                <div className={styles.actions}>
                                  {selectedThisRun.status === "paused" ? (
                                    <button disabled={busyId === selectedThisRun.id} className={styles.btn}
                                      onClick={() => runAction(selectedThisRun.id, startPaperRun)}>Resume</button>
                                  ) : null}
                                  {selectedThisRun.status === "active" ? (
                                    <button disabled={busyId === selectedThisRun.id} className={styles.btn}
                                      onClick={() => runAction(selectedThisRun.id, pausePaperRun)}>Pause</button>
                                  ) : null}
                                  {selectedThisRun.status !== "stopped" ? (
                                    <button disabled={busyId === selectedThisRun.id} className={styles.btn}
                                      onClick={() => {
                                        selectedRunIdRef.current = null
                                        setSelectedRun(null)
                                        void runAction(selectedThisRun.id, stopPaperRun)
                                      }}>Stop</button>
                                  ) : null}
                                  <button disabled={busyId === selectedThisRun.id} className={styles.btn}
                                    onClick={() => runAction(selectedThisRun.id, restartPaperRun)}>Restart</button>
                                </div>

                                {selectedThisRun.ticks.length === 0 ? (
                                  <span className={styles.empty}>
                                    No ticks yet — the curve starts with the first bar after start.
                                  </span>
                                ) : (
                                  <EquityCurveChart
                                    points={selectedThisRun.ticks.map((tk) => ({ ts: tk.ts, equity: tk.equity }))}
                                    frequency={selectedThisRun.frequency}
                                    easternTime
                                  />
                                )}

                                <div className={styles.tradeList}>
                                  {selectedThisRun.trades.length === 0 ? (
                                    <span className={styles.empty}>No trades yet.</span>
                                  ) : (
                                    selectedThisRun.trades.slice(-8).reverse().map((tr, i) => (
                                      <div key={i} className={styles.tradeRow}>
                                        <span className={tr.side === "buy" ? styles.pos : styles.neg}>{tr.side}</span>
                                        <span>{tr.qty} @ {money(tr.price)}</span>
                                        <span className={styles.tradeTs}>{formatEt(tr.ts)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {apiOpenId === t.id && t.isPublished && apiBase ? (
                              <div className={styles.detail}>
                                <div className={styles.apiRow}>
                                  <span className={styles.apiLabel}>Trade signals</span>
                                  <code className={styles.apiUrl}>{apiBase}/trade-signals</code>
                                  <button
                                    className={styles.btn}
                                    onClick={() => copyText(`trade-${t.id}`, `${apiBase}/trade-signals`)}
                                  >
                                    {copiedKey === `trade-${t.id}` ? "Copied" : "Copy"}
                                  </button>
                                </div>
                                <div className={styles.apiRow}>
                                  <span className={styles.apiLabel}>Signals</span>
                                  <code className={styles.apiUrl}>{apiBase}/signals</code>
                                  <button
                                    className={styles.btn}
                                    onClick={() => copyText(`sig-${t.id}`, `${apiBase}/signals`)}
                                  >
                                    {copiedKey === `sig-${t.id}` ? "Copied" : "Copy"}
                                  </button>
                                </div>
                                <pre className={styles.curlBlock}>{`curl -H "X-API-Key: <your-key>" \\\n  "${apiBase}/trade-signals?range=1y"`}</pre>
                                <div className={styles.apiHint}>
                                  Authenticate with an API key from <Link href="/settings">Settings</Link>.
                                  Full reference in the <Link href="/developers/custom-signal-tests">API docs</Link>.
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
