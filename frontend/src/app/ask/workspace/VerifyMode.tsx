"use client"

import { useCallback, useState } from "react"

import { getVerify, startVerify, type VerifyResult } from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import VerdictCard from "../components/VerdictCard"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob, JobProgress, JobError } from "./skillJob"
import styles from "./VerifyMode.module.css"
import workspace from "./Workspace.module.css"

type Phase = "idle" | "running" | "error"

export default function VerifyMode() {
  const { selectedKeys } = useZoteroSelection()
  const { openPdf, saveRun, activeArtifact, setActiveArtifact } = useWorkspace()
  const { progress, error, setError, newRun, isStale, track } = useSkillJob()

  const docIds = Array.from(selectedKeys).sort()
  const [claim, setClaim] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  // Completed checks this session, newest first — a ledger, not a chat thread.
  const [results, setResults] = useState<VerifyResult[]>([])

  const loaded = activeArtifact?.kind === "verify" ? activeArtifact : null

  const onOpenSource = useCallback(
    (e: { sourceId?: string; title: string; page?: number | null; passage?: string; bbox?: number[] | null }) =>
      openPdf({ sourceId: e.sourceId, title: e.title, page: e.page, passage: e.passage, bbox: e.bbox }),
    [openPdf],
  )

  const run = useCallback(async () => {
    const text = claim.trim()
    if (!text || docIds.length === 0) return
    const token = newRun()
    setPhase("running")
    try {
      const { jobId } = await startVerify(text, docIds)
      await track(token, jobId, getVerify, {
        onDone: (s) => {
          if (s.result) {
            setResults((prev) => [s.result as VerifyResult, ...prev])
            setPhase("idle")
            setClaim("")
            void saveRun("verify", `Verify: ${text}`, { result: s.result })
          } else {
            setError("No result returned.")
            setPhase("error")
          }
        },
        onError: () => setPhase("error"),
        fallbackError: "Verification failed.",
      })
    } catch (e) {
      if (isStale(token)) return
      setError(String(e))
      setPhase("error")
    }
  }, [claim, docIds, newRun, isStale, track, saveRun, setError])

  // A check reopened from History — render it on its own with a way back to a fresh check.
  if (loaded) {
    return (
      <div className={workspace.modeFill}>
        <div className={workspace.modeHeader}>
          <span className={workspace.modeHeaderTitle}>Verification</span>
          <button type="button" className={workspace.linkBtn} onClick={() => setActiveArtifact(null)}>
            New check
          </button>
        </div>
        <div className={workspace.modeBody}>
          <VerdictCard result={loaded.result} onOpenSource={onOpenSource} />
        </div>
      </div>
    )
  }

  return (
    <div className={workspace.modeFill}>
      <div className={styles.composer}>
        <textarea
          className={styles.input}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void run()
            }
          }}
          rows={2}
          placeholder="Check a claim against your selected papers — e.g. “LSTMs beat classical baselines on forecasting”"
        />
        <div className={styles.composerFoot}>
          <span className={styles.scopeNote}>
            {docIds.length === 0
              ? "Select papers in the library to check against"
              : `Checking ${docIds.length} selected paper${docIds.length === 1 ? "" : "s"}`}
          </span>
          <button
            type="button"
            className={styles.checkBtn}
            disabled={!claim.trim() || docIds.length === 0 || phase === "running"}
            onClick={() => void run()}
          >
            Verify
          </button>
        </div>
      </div>

      {phase === "running" ? <JobProgress progress={progress} fallback="Checking…" /> : null}
      {phase === "error" ? <JobError error={error} onRetry={() => void run()} retryLabel="Try again" /> : null}

      {results.length === 0 && phase === "idle" ? (
        <p className={styles.empty}>
          Verify checks a claim against the papers you’ve selected — each paper gets a verdict
          (supports / contradicts / mixed / doesn’t address) with the exact passage and page.
        </p>
      ) : null}

      <div className={styles.stack}>
        {results.map((r, i) => (
          <VerdictCard key={i} result={r} onOpenSource={onOpenSource} />
        ))}
      </div>
    </div>
  )
}
