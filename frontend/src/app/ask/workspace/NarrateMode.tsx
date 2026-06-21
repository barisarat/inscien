"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AudioLines, Loader2 } from "lucide-react"

import { getNarration, listNarrations, listPapers, startNarration } from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type Phase = "idle" | "running" | "done" | "error"

export default function NarrateMode() {
  const { selectedKeys } = useZoteroSelection()
  const { activeArtifact } = useWorkspace()
  const loaded = activeArtifact?.kind === "narration" ? activeArtifact : null
  const keys = Array.from(selectedKeys)
  const docId = loaded ? loaded.docId : keys.length === 1 ? keys[0] : null

  const [phase, setPhase] = useState<Phase>("idle")
  const [title, setTitle] = useState("")
  const [jobId, setJobId] = useState("")
  const [progress, setProgress] = useState<{ stage?: string; detail?: string; progress?: number }>({})
  const [error, setError] = useState<string | null>(null)
  const runToken = useRef(0)

  // Reset (and cancel any in-flight poll) when the selected paper changes; resolve title.
  useEffect(() => {
    const token = ++runToken.current
    setPhase("idle")
    setJobId("")
    setProgress({})
    setError(null)
    setTitle("")
    if (loaded || !docId) return
    // Auto-detect an already-generated narration for this paper so we play it instead
    // of regenerating.
    void Promise.all([listPapers(), listNarrations()])
      .then(([{ papers }, { items }]) => {
        if (token !== runToken.current) return
        setTitle(papers.find((p) => p.docId === docId)?.title || "")
        const existing = items.find((n) => n.docId === docId)
        if (existing) {
          setJobId(existing.jobId)
          setPhase("done")
        }
      })
      .catch(() => {})
  }, [docId, loaded])

  const run = useCallback(async () => {
    if (!docId) return
    const token = ++runToken.current
    setPhase("running")
    setProgress({})
    setError(null)
    try {
      const res = await startNarration({ docId })
      if (token !== runToken.current) return
      setJobId(res.jobId)
      if (res.title) setTitle(res.title)
      for (;;) {
        if (token !== runToken.current) return
        const s = await getNarration(res.jobId)
        if (token !== runToken.current) return
        setProgress({ stage: s.stage, detail: s.detail, progress: s.progress })
        if (s.title) setTitle(s.title)
        if (s.status === "done") {
          setPhase("done")
          return
        }
        if (s.status === "error") {
          setError(s.error || "Narration failed.")
          setPhase("error")
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    } catch (e) {
      if (token === runToken.current) {
        setError(String(e))
        setPhase("error")
      }
    }
  }, [docId])

  if (loaded) {
    const audioUrl = `${API_BASE}/api/narrate/${encodeURIComponent(loaded.jobId)}/audio`
    return (
      <div className={styles.modeCentered}>
        <div className={compareStyles.confirm}>
          <div className={compareStyles.confirmHead}>
            <span className={compareStyles.confirmTitle}>{loaded.title || "Narration"}</span>
          </div>
          <div className={styles.audioWrap}>
            <audio className={styles.audio} controls autoPlay src={audioUrl} />
            <a className={styles.linkBtn} href={audioUrl} download>
              Download mp3
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!docId) {
    return (
      <div className={styles.placeholder}>
        <h2 className={styles.placeholderTitle}>Narrate</h2>
        <p className={styles.placeholderHint}>
          Select exactly one paper in the library to generate an audio narration.
        </p>
        <p className={styles.placeholderMeta}>{keys.length} selected</p>
      </div>
    )
  }

  return (
    <div className={styles.modeCentered}>
      <div className={compareStyles.confirm}>
        <div className={compareStyles.confirmHead}>
          <span className={compareStyles.confirmTitle}>{title || "Selected paper"}</span>
        </div>

        {phase === "running" ? (
          <div className={styles.runProgress}>
            <div className={styles.runStage}>
              <Loader2 size={13} className={styles.spin} /> {progress.detail || progress.stage || "Generating audio…"}
            </div>
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${Math.max(2, progress.progress ?? 0)}%` }} />
            </div>
            <div className={compareStyles.confirmStatus}>
              Generating audio in the background (a few minutes) — you can keep working.
            </div>
          </div>
        ) : phase === "done" ? (
          <div className={styles.audioWrap}>
            <audio className={styles.audio} controls src={`${API_BASE}/api/narrate/${encodeURIComponent(jobId)}/audio`} />
            <a
              className={styles.linkBtn}
              href={`${API_BASE}/api/narrate/${encodeURIComponent(jobId)}/audio`}
              download
            >
              Download mp3
            </a>
          </div>
        ) : phase === "error" ? (
          <div className={styles.errorBox}>
            {error || "Something went wrong."}
            <button type="button" className={styles.linkBtn} onClick={run}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className={compareStyles.confirmStatus}>
              Generate a spoken-audio narration of this paper.
            </div>
            <div className={compareStyles.confirmActions}>
              <button type="button" className={compareStyles.runBtn} onClick={run}>
                <AudioLines size={14} /> Generate narration
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
