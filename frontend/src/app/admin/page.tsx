"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AppSidebar from "@/components/navigation/AppSidebar"
import { useSidebar } from "@/lib/SidebarProvider"
import { useAuth } from "@/lib/auth"
import { useChatSidebar } from "@/lib/useChatSidebar"
import {
  type AdminStatus,
  type AdminTaskRun,
  getAdminStatus,
  getAdminTaskRuns,
} from "@/lib/api"
import { timeAgo } from "@/lib/time"
import styles from "./page.module.css"

const POLL_MS = 30_000
const SNAPSHOT_STALE_MS = 75 * 60 * 1000
const FREQUENCIES = ["5min", "15min", "30min", "60min"]

function fmtDuration(ms: number | null | undefined) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtCadence(hours: number | null) {
  if (hours == null) return "—"
  if (hours < 1) return `~${Math.round(hours * 60)}m`
  if (hours < 48) return `~${hours}h`
  return `~${Math.round(hours / 24)}d`
}

/** Primitive telemetry entries from a task's result JSON, for generic chips. */
function telemetryEntries(result: Record<string, unknown> | null): [string, string][] {
  if (!result) return []
  return Object.entries(result)
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)])
}

export default function AdminMonitorPage() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const { contextItems: chatItems } = useChatSidebar()

  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [error, setError] = useState("")
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [drilldown, setDrilldown] = useState<AdminTaskRun[]>([])

  const isAdmin = Boolean(user?.is_admin)

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      window.location.href = "/"
    }
  }, [isLoading, isAuthenticated, isAdmin])

  const load = useCallback(async () => {
    try {
      setStatus(await getAdminStatus())
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status")
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    void load()
  }, [isAuthenticated, isAdmin, load])

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [isAuthenticated, isAdmin, load])

  const toggleTask = useCallback(async (name: string) => {
    if (expandedTask === name) {
      setExpandedTask(null)
      setDrilldown([])
      return
    }
    setExpandedTask(name)
    try {
      const { runs } = await getAdminTaskRuns(name, 25)
      setDrilldown(runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task history")
    }
  }, [expandedTask])

  const violationKeys = useMemo(
    () => new Set((status?.violations ?? []).map((v) => v.key)),
    [status]
  )

  const snapshotStale = useMemo(() => {
    if (!status?.checkedAt) return false
    return Date.now() - new Date(`${status.checkedAt}`).getTime() > SNAPSHOT_STALE_MS
  }, [status])

  if (isLoading || !isAuthenticated || !isAdmin) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.loading}>Loading…</div>
      </div>
    )
  }

  const gdelt = status?.metrics?.gdelt
  const market = status?.metrics?.market
  const history = [...(status?.violationHistory ?? [])].reverse()

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/admin"
        sectionTitle="Chats"
        contextItems={chatItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>System Monitor</h1>
            <p className={styles.desc}>
              Read-only view of the data pipelines: scheduled tasks, GDELT and
              market data coverage, and active paper runs.
            </p>
          </header>

          {error ? <div className={styles.error}>{error}</div> : null}

          {!status ? (
            <p className={styles.empty}>Loading status…</p>
          ) : (
            <>
              {/* Health banner */}
              <section className={styles.section}>
                <div className={`${styles.banner} ${
                  status.healthy == null ? "" : status.healthy ? styles.bannerOk : styles.bannerBad}`}>
                  {status.healthy == null ? (
                    <span>No health snapshot yet — the hourly check has not run.</span>
                  ) : (
                    <span>
                      <strong>{status.healthy ? "Healthy" : `${status.violations.length} violation${status.violations.length === 1 ? "" : "s"}`}</strong>
                      {" · "}checked {timeAgo(status.checkedAt)}
                    </span>
                  )}
                  {snapshotStale ? (
                    <span className={`${styles.pill} ${styles.pillCritical}`}>
                      snapshot stale — health task may be down
                    </span>
                  ) : null}
                </div>

                {history.length > 0 ? (
                  <div className={styles.historyStrip} title="Last 48 health checks (oldest → newest)">
                    {history.map((h) => (
                      <span
                        key={h.checkedAt}
                        className={`${styles.historyCell} ${h.healthy ? styles.cellOk : styles.cellBad}`}
                        title={`${h.checkedAt}: ${h.healthy ? "healthy" : `${h.count} violations`}`}
                      />
                    ))}
                  </div>
                ) : null}
              </section>

              {/* Current violations */}
              {status.violations.length > 0 ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Violations</h2>
                  <div className={styles.listWrap}>
                    {status.violations.map((v) => (
                      <div key={v.key} className={styles.listRow}>
                        <span className={`${styles.pill} ${v.severity === "critical" ? styles.pillCritical : styles.pillWarn}`}>
                          {v.severity}
                        </span>
                        <span className={styles.violationKey}>{v.key}</span>
                        <span className={styles.violationMsg}>{v.message}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Schedule board */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Scheduled tasks</h2>
                <div className={styles.taskGrid}>
                  {status.taskRuns.map((t) => {
                    const late = violationKeys.has(`task.${t.taskName}.late`)
                    const run = t.lastRun
                    return (
                      <div key={t.taskName} className={styles.taskCard}>
                        <div className={styles.taskHead}>
                          <button className={styles.taskName} onClick={() => toggleTask(t.taskName)}>
                            {t.taskName}
                          </button>
                          <span className={styles.headPills}>
                            {late ? <span className={`${styles.pill} ${styles.pillCritical}`}>late</span> : null}
                            {run ? (
                              <span className={`${styles.pill} ${run.status === "success" ? styles.pillOk : styles.pillCritical}`}>
                                {run.status}
                              </span>
                            ) : (
                              <span className={`${styles.pill} ${styles.pillWarn}`}>never ran</span>
                            )}
                          </span>
                        </div>

                        <div className={styles.metricRow}>
                          <span className={styles.metric}>Last <strong>{timeAgo(run?.startedAt)}</strong></span>
                          <span className={styles.metric}>Took <strong>{fmtDuration(run?.durationMs)}</strong></span>
                          <span className={styles.metric}>Every <strong>{fmtCadence(t.expectedEveryHours)}</strong></span>
                        </div>

                        {run?.error ? (
                          <div className={styles.taskError}>{run.error.slice(0, 300)}</div>
                        ) : telemetryEntries(run?.result ?? null).length > 0 ? (
                          <div className={styles.metricRow}>
                            {telemetryEntries(run?.result ?? null).map(([k, v]) => (
                              <span key={k} className={styles.metric}>{k} <strong>{v}</strong></span>
                            ))}
                          </div>
                        ) : null}

                        {expandedTask === t.taskName ? (
                          <div className={styles.drilldown}>
                            {drilldown.length === 0 ? (
                              <span className={styles.empty}>No history.</span>
                            ) : (
                              drilldown.map((r) => (
                                <div key={r.id} className={styles.drillRow}>
                                  <span className={`${styles.pill} ${r.status === "success" ? styles.pillOk : styles.pillCritical}`}>
                                    {r.status}
                                  </span>
                                  <span>{timeAgo(r.startedAt)}</span>
                                  <span>{fmtDuration(r.durationMs)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* GDELT panel */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>GDELT news data</h2>
                {!gdelt ? (
                  <p className={styles.empty}>No GDELT metrics in the latest snapshot.</p>
                ) : (
                  <>
                    <div className={styles.metricRow}>
                      <span className={styles.metric}>Cursor lag <strong>{gdelt.cursorLagMinutes != null ? `${gdelt.cursorLagMinutes}m` : "—"}</strong></span>
                      <span className={styles.metric}>Last reconciled <strong>{gdelt.lastDailyDay ?? "—"}</strong></span>
                      <span className={styles.metric}>Flush boundary <strong>{gdelt.flushBoundary ?? "—"}</strong></span>
                      <span className={styles.metric}>Yesterday <strong>{gdelt.yesterdayRows != null ? `${gdelt.yesterdayRows.toLocaleString()} articles` : "—"}</strong></span>
                    </div>
                    <div className={styles.coverageStrip} title="Last 60 days (oldest → newest)">
                      {gdelt.dayCoverage.map((d) => (
                        <span
                          key={d.day}
                          className={`${styles.coverageCell} ${
                            d.tier === "missing" ? styles.cellBad
                            : d.tier === "hot" ? styles.cellOk
                            : styles.cellCold}`}
                          title={`${d.day}: ${d.tier}${d.rows != null ? `, ${d.rows} articles` : ""}`}
                        />
                      ))}
                    </div>
                    <div className={styles.legend}>
                      <span><span className={`${styles.coverageCell} ${styles.cellCold}`} /> cold (parquet)</span>
                      <span><span className={`${styles.coverageCell} ${styles.cellOk}`} /> hot (DB)</span>
                      <span><span className={`${styles.coverageCell} ${styles.cellBad}`} /> missing</span>
                    </div>
                  </>
                )}
              </section>

              {/* Market panel */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Market bars</h2>
                {!market ? (
                  <p className={styles.empty}>No market metrics in the latest snapshot.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          {FREQUENCIES.map((f) => <th key={f}>{f}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(market).map(([ticker, freqs]) => (
                          <tr key={ticker}>
                            <td className={styles.tickerCell}>{ticker}</td>
                            {FREQUENCIES.map((f) => {
                              const cell = freqs[f]
                              const stale = violationKeys.has(`market.${ticker}.${f}.stale`)
                                || violationKeys.has(`market.${ticker}.${f}.missing`)
                              const cls = stale ? styles.tdBad
                                : cell && !cell.inWindow ? styles.tdMuted
                                : ""
                              return (
                                <td key={f} className={cls}>
                                  {cell?.availableTo ? timeAgo(cell.availableTo) : "—"}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Paper runs panel */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Active paper runs</h2>
                {status.paperRuns.length === 0 ? (
                  <p className={styles.empty}>No active runs.</p>
                ) : (
                  <div className={styles.listWrap}>
                    {status.paperRuns.map((run) => {
                      const stuck = violationKeys.has(`paper.run.${run.id}.stuck`)
                      return (
                        <div key={run.id} className={styles.listRow}>
                          <span className={styles.rowName}>{run.ticker} <span className={styles.rowSub}>{run.rule} · {run.frequency}</span></span>
                          {stuck ? <span className={`${styles.pill} ${styles.pillWarn}`}>stuck</span> : null}
                          <span className={styles.rowMeta}>last tick {timeAgo(run.lastTickAt)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
