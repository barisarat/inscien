"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"

import {
  getCompare,
  listPapers,
  proposeCompare,
  startCompare,
  type CompareResult,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import ComparisonView from "../components/ComparisonView"
import compareStyles from "../components/Compare.module.css"
import { useWorkspace } from "./WorkspaceProvider"
import styles from "./Workspace.module.css"

type Phase = "need-more" | "proposing" | "configure" | "running" | "done" | "error"
type Paper = { docId: string; title: string }

export default function CompareMode() {
  const { selectedKeys } = useZoteroSelection()
  const { openPdf, saveRun, activeArtifact, setActiveArtifact } = useWorkspace()

  const docIds = Array.from(selectedKeys).sort()
  const docIdsKey = docIds.join(",")

  const [phase, setPhase] = useState<Phase>("need-more")
  const [papers, setPapers] = useState<Paper[]>([])
  const [dimensions, setDimensions] = useState<string[]>([])
  const [dimDraft, setDimDraft] = useState("")
  const [progress, setProgress] = useState<{ stage?: string; detail?: string; progress?: number }>({})
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runToken = useRef(0)
  const loaded = activeArtifact?.kind === "comparison" ? activeArtifact : null

  // (Re)propose dimensions when the selected set changes — unless we're showing a
  // run loaded from History (the loaded run wins until the user starts fresh).
  useEffect(() => {
    if (loaded) return
    const token = ++runToken.current
    setResult(null)
    setError(null)
    if (docIds.length < 2) {
      setPhase("need-more")
      return
    }
    setPhase("proposing")
    void (async () => {
      try {
        const [{ papers: all }, { dimensions: proposed }] = await Promise.all([
          listPapers(),
          proposeCompare(docIds),
        ])
        if (token !== runToken.current) return
        const titleOf = new Map(all.map((p) => [p.docId, p.title]))
        setPapers(docIds.map((id) => ({ docId: id, title: titleOf.get(id) || id })))
        setDimensions(proposed)
        setPhase("configure")
      } catch (e) {
        if (token !== runToken.current) return
        setError(String(e))
        setPhase("error")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docIdsKey, Boolean(loaded)])

  const addDimension = useCallback(() => {
    const v = dimDraft.trim()
    if (!v) return
    setDimensions((d) => (d.includes(v) ? d : [...d, v]))
    setDimDraft("")
  }, [dimDraft])

  const removeDimension = useCallback((d: string) => {
    setDimensions((cur) => cur.filter((x) => x !== d))
  }, [])

  const run = useCallback(async () => {
    const token = ++runToken.current
    setPhase("running")
    setProgress({})
    setError(null)
    try {
      const { jobId } = await startCompare(docIds, dimensions)
      for (;;) {
        if (token !== runToken.current) return
        const s = await getCompare(jobId)
        if (token !== runToken.current) return
        setProgress({ stage: s.stage, detail: s.detail, progress: s.progress })
        if (s.status === "done") {
          if (s.result) {
            setResult(s.result)
            setPhase("done")
            const title = `Compare: ${papers.map((p) => p.title).join(" · ")}`
            void saveRun("comparison", title, { result: s.result, papers, dimensions })
          } else {
            setError("No result returned.")
            setPhase("error")
          }
          return
        }
        if (s.status === "error") {
          setError(s.error || "Comparison failed.")
          setPhase("error")
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    } catch (e) {
      if (token !== runToken.current) return
      setError(String(e))
      setPhase("error")
    }
  }, [docIdsKey, dimensions, papers, saveRun])

  const shown = loaded ? loaded.result : phase === "done" ? result : null

  if (shown) {
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>Comparison · {shown.papers.length} papers</span>
          {loaded ? (
            <button type="button" className={styles.linkBtn} onClick={() => setActiveArtifact(null)}>
              New comparison
            </button>
          ) : (
            <button type="button" className={styles.linkBtn} onClick={() => setPhase("configure")}>
              Edit dimensions
            </button>
          )}
        </div>
        <div className={styles.modeBody}>
          <ComparisonView
            data={shown}
            onOpenCell={(c) =>
              openPdf({ sourceId: c.sourceId, title: c.title, page: c.page, passage: c.passage })
            }
          />
        </div>
      </div>
    )
  }

  if (phase === "need-more") {
    return (
      <div className={styles.placeholder}>
        <h2 className={styles.placeholderTitle}>Compare</h2>
        <p className={styles.placeholderHint}>
          Select 2 or more papers in the library to build a grounded comparison table.
        </p>
        <p className={styles.placeholderMeta}>{docIds.length} selected</p>
      </div>
    )
  }

  return (
    <div className={styles.modeCentered}>
      <div className={compareStyles.confirm}>
        <div className={compareStyles.confirmHead}>
          <span className={compareStyles.confirmTitle}>Compare {docIds.length} papers</span>
        </div>

        {papers.length > 0 ? (
          <div className={compareStyles.confirmPapers}>
            {papers.map((p) => (
              <span key={p.docId} className={compareStyles.confirmPaper} title={p.title}>
                {p.title}
              </span>
            ))}
          </div>
        ) : null}

        {phase === "proposing" ? (
          <div className={compareStyles.confirmStatus}>
            <Loader2 size={13} className={styles.spin} /> Proposing comparison dimensions…
          </div>
        ) : phase === "running" ? (
          <div className={styles.runProgress}>
            <div className={styles.runStage}>
              <Loader2 size={13} className={styles.spin} /> {progress.detail || progress.stage || "Comparing…"}
            </div>
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${progress.progress ?? 5}%` }} />
            </div>
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
            <div className={compareStyles.confirmLabel}>Comparison dimensions — edit before running</div>
            <div className={compareStyles.dimChips}>
              {dimensions.map((d) => (
                <span key={d} className={compareStyles.dimChip}>
                  <span>{d}</span>
                  <button
                    type="button"
                    className={compareStyles.chipX}
                    aria-label={`Remove ${d}`}
                    onClick={() => removeDimension(d)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <div className={compareStyles.dimAddRow}>
              <input
                className={compareStyles.dimInput}
                value={dimDraft}
                onChange={(e) => setDimDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addDimension()
                  }
                }}
                placeholder="Add a dimension…"
              />
              <button
                type="button"
                className={compareStyles.dimAddBtn}
                onClick={addDimension}
                disabled={!dimDraft.trim()}
              >
                Add
              </button>
            </div>
            <div className={compareStyles.confirmActions}>
              <button
                type="button"
                className={compareStyles.runBtn}
                disabled={dimensions.length === 0}
                onClick={run}
              >
                Run comparison
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
