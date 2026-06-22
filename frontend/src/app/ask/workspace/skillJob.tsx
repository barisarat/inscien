"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { pollJob, type JobStatus } from "@/lib/pollJob"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

export interface SkillProgress {
  stage?: string
  detail?: string
  progress?: number
}

interface TrackHandlers<T extends JobStatus> {
  onProgress?: (s: T) => void
  onDone: (s: T) => void | Promise<void>
  onError?: () => void
  fallbackError?: string
}

// Shared background-job plumbing for the skill modes (Compare/Write/Narrate/Graph): the
// run-generation token + unmount cancellation, progress/error state, and the `pollJob`
// wiring. Each mode keeps its own `phase` enum and success handling; this just removes the
// four copies of "bump token, reset, poll-with-cancellation, surface errors".
export function useSkillJob() {
  const runToken = useRef(0)
  const [progress, setProgress] = useState<SkillProgress>({})
  const [error, setError] = useState<string | null>(null)

  // Stop any in-flight poll loop when the mode unmounts (e.g. switching to Ask).
  useEffect(() => () => { runToken.current += 1 }, [])

  // Begin a new run: invalidate any in-flight poll and clear progress/error. Returns the
  // generation token the caller threads through `isStale`/`track`.
  const newRun = useCallback(() => {
    const token = ++runToken.current
    setProgress({})
    setError(null)
    return token
  }, [])

  const isStale = useCallback((token: number) => token !== runToken.current, [])

  // Poll a job to completion with shared cancellation + progress/error wiring. Works for a
  // fresh run and for re-attaching to an already-running job (NarrateMode). Returns the
  // poll promise so callers can `await` it.
  const track = useCallback(
    <T extends JobStatus>(
      token: number,
      jobId: string,
      get: (id: string) => Promise<T>,
      h: TrackHandlers<T>,
    ) =>
      pollJob(jobId, get, {
        isCancelled: () => token !== runToken.current,
        onProgress: (s) => {
          setProgress({ stage: s.stage, detail: s.detail, progress: s.progress })
          h.onProgress?.(s)
        },
        onDone: h.onDone,
        onError: (s) => {
          setError(s.error || h.fallbackError || "Something went wrong.")
          h.onError?.()
        },
      }),
    [],
  )

  return { progress, setProgress, error, setError, newRun, isStale, track }
}

// The running progress bar shared by every skill mode. `minPct`/`defaultPct` reproduce each
// mode's exact bar width; `note` is the optional background-generation line (NarrateMode).
export function JobProgress({
  progress,
  fallback,
  minPct = 0,
  defaultPct = 5,
  note,
}: {
  progress: SkillProgress
  fallback: string
  minPct?: number
  defaultPct?: number
  note?: string
}) {
  const pct = Math.max(minPct, progress.progress ?? defaultPct)
  return (
    <div className={styles.runProgress}>
      <div className={styles.runStage}>
        <Loader2 size={13} className={styles.spin} /> {progress.detail || progress.stage || fallback}
      </div>
      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      {note ? <div className={compareStyles.confirmStatus}>{note}</div> : null}
    </div>
  )
}

// The error box + retry shared by every skill mode.
export function JobError({
  error,
  onRetry,
  retryLabel = "Retry",
}: {
  error: string | null
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <div className={styles.errorBox}>
      {error || "Something went wrong."}
      <button type="button" className={styles.linkBtn} onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}
