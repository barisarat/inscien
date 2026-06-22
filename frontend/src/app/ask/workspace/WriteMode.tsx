"use client"

import { useCallback, useState } from "react"
import { Loader2, X } from "lucide-react"

import { getWriteup, listPapers, proposePlan, startWriteup, type PaperItem, type WriteResult } from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob, JobProgress, JobError } from "./skillJob"
import { AnswerRenderer, CompactSources, type Citation } from "./answer/AnswerRenderer"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

type Phase = "topic" | "planning" | "configure" | "running" | "done" | "error"

// The draft renders with the exact chat-answer styling (shared AnswerRenderer + Sources).
function DraftView({
  answer,
  citations,
  onOpen,
}: {
  answer: string
  citations: Citation[]
  onOpen: (c: Citation) => void
}) {
  return (
    <>
      <AnswerRenderer text={answer} citations={citations} onOpenSource={onOpen} />
      <CompactSources citations={citations} onOpenSource={onOpen} />
    </>
  )
}

export default function WriteMode() {
  const { openPdf, saveRun, activeArtifact, setActiveArtifact } = useWorkspace()
  const { selectedKeys } = useZoteroSelection()
  const loaded = activeArtifact?.kind === "writeup" ? activeArtifact : null

  const [phase, setPhase] = useState<Phase>("topic")
  const [topic, setTopic] = useState("")
  const [candidates, setCandidates] = useState<PaperItem[]>([])
  const [scope, setScope] = useState<string[]>([])
  const [dimensions, setDimensions] = useState<string[]>([])
  const [dimDraft, setDimDraft] = useState("")
  const [result, setResult] = useState<WriteResult | null>(null)
  // True when the finished draft couldn't be persisted to History (draft still shows).
  const [saveWarning, setSaveWarning] = useState(false)
  const { progress, error, setError, newRun, isStale, track } = useSkillJob()

  const openCitation = useCallback(
    (c: Citation) => openPdf({ sourceId: c.sourceId, title: c.title, page: c.page, passage: c.passage }),
    [openPdf],
  )

  const addDimension = useCallback(() => {
    const v = dimDraft.trim()
    if (!v) return
    setDimensions((d) => (d.includes(v) ? d : [...d, v]))
    setDimDraft("")
  }, [dimDraft])

  const plan = useCallback(async () => {
    const t = topic.trim()
    if (!t) return
    const token = newRun()
    setPhase("planning")
    try {
      const selIds = Array.from(selectedKeys)
      const [{ papers: suggested, dimensions: dims }, all] = await Promise.all([
        proposePlan(t),
        selIds.length > 0 ? listPapers() : Promise.resolve({ papers: [] as PaperItem[] }),
      ])
      if (isStale(token)) return
      // The library selection drives the review: selected papers lead the candidate
      // list (pre-included), with the topic-proposed papers offered after them.
      const titleOf = new Map(all.papers.map((p) => [p.docId, p.title]))
      const selectedPapers: PaperItem[] = selIds.map((id) => ({ docId: id, title: titleOf.get(id) || id }))
      const seen = new Set<string>()
      const candidates: PaperItem[] = []
      for (const p of [...selectedPapers, ...suggested]) {
        if (!seen.has(p.docId)) {
          seen.add(p.docId)
          candidates.push(p)
        }
      }
      setCandidates(candidates)
      setScope(selectedPapers.length > 0 ? selectedPapers.map((p) => p.docId) : suggested.map((p) => p.docId))
      setDimensions(dims)
      setPhase("configure")
    } catch (e) {
      if (isStale(token)) return
      setError(String(e))
      setPhase("error")
    }
  }, [topic, selectedKeys, newRun, isStale, setError])

  const run = useCallback(async () => {
    const token = newRun()
    setSaveWarning(false)
    setPhase("running")
    try {
      const { jobId } = await startWriteup(topic.trim(), scope, dimensions)
      await track(token, jobId, getWriteup, {
        onDone: (s) => {
          if (s.result) {
            setResult(s.result)
            setPhase("done")
            void saveRun("writeup", `Review: ${topic.trim()}`, {
              answer: s.result.answer,
              citations: s.result.citations,
            }).then((sid) => { if (sid === null) setSaveWarning(true) })
          } else {
            setError("No draft returned.")
            setPhase("error")
          }
        },
        onError: () => setPhase("error"),
        fallbackError: "Draft failed.",
      })
    } catch (e) {
      if (isStale(token)) return
      setError(String(e))
      setPhase("error")
    }
  }, [topic, scope, dimensions, saveRun, newRun, isStale, track, setError])

  // A run loaded from History.
  if (loaded) {
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>Literature review</span>
          <button type="button" className={styles.linkBtn} onClick={() => setActiveArtifact(null)}>
            New review
          </button>
        </div>
        <div className={styles.readingScroll}>
          <div className={styles.reading}>
            <DraftView answer={loaded.answer} citations={(loaded.citations as Citation[]) || []} onOpen={openCitation} />
          </div>
        </div>
      </div>
    )
  }

  if (phase === "done" && result) {
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>Literature review</span>
          <button type="button" className={styles.linkBtn} onClick={() => setPhase("topic")}>
            New review
          </button>
        </div>
        {saveWarning ? (
          <div className={styles.saveWarning}>Couldn’t save this review to History.</div>
        ) : null}
        <div className={styles.readingScroll}>
          <div className={styles.reading}>
            <DraftView answer={result.answer} citations={result.citations} onOpen={openCitation} />
          </div>
        </div>
      </div>
    )
  }

  if (phase === "topic") {
    return (
      <div className={styles.modeCentered}>
        <div className={compareStyles.confirm}>
          <div className={compareStyles.confirmHead}>
            <span className={compareStyles.confirmTitle}>Write a literature review</span>
          </div>
          <div className={compareStyles.confirmLabel}>What should the review cover?</div>
          <div className={compareStyles.dimAddRow}>
            <input
              className={compareStyles.dimInput}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void plan()
                }
              }}
              placeholder="e.g. machine learning for house price prediction"
              autoFocus
            />
          </div>
          <div className={compareStyles.confirmActions}>
            <button type="button" className={compareStyles.runBtn} disabled={!topic.trim()} onClick={plan}>
              Plan review
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.modeCentered}>
      <div className={compareStyles.confirm}>
        <div className={compareStyles.confirmHead}>
          <span className={compareStyles.confirmTitle}>Review on: {topic}</span>
          {phase !== "running" ? (
            <button type="button" className={compareStyles.confirmCancel} onClick={() => setPhase("topic")}>
              Change topic
            </button>
          ) : null}
        </div>

        {phase === "planning" ? (
          <div className={compareStyles.confirmStatus}>
            <Loader2 size={13} className={styles.spin} /> Finding the most relevant papers…
          </div>
        ) : phase === "running" ? (
          <JobProgress progress={progress} fallback="Writing…" />
        ) : phase === "error" ? (
          <JobError error={error} onRetry={() => setPhase("topic")} retryLabel="Start over" />
        ) : (
          <>
            <div className={compareStyles.confirmLabel}>Papers — most relevant in your library (toggle to include)</div>
            <div className={compareStyles.scopeChips}>
              {candidates.map((p) => {
                const on = scope.includes(p.docId)
                return (
                  <button
                    key={p.docId}
                    type="button"
                    title={p.title}
                    className={`${compareStyles.scopeChip} ${on ? compareStyles.scopeChipOn : ""}`}
                    onClick={() =>
                      setScope((cur) => (cur.includes(p.docId) ? cur.filter((x) => x !== p.docId) : [...cur, p.docId]))
                    }
                  >
                    {p.title}
                  </button>
                )
              })}
            </div>
            <div className={compareStyles.confirmLabel}>Dimensions to extract from each paper — edit before running</div>
            <div className={compareStyles.dimChips}>
              {dimensions.map((d) => (
                <span key={d} className={compareStyles.dimChip}>
                  <span>{d}</span>
                  <button
                    type="button"
                    className={compareStyles.chipX}
                    aria-label={`Remove ${d}`}
                    onClick={() => setDimensions((cur) => cur.filter((x) => x !== d))}
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
                disabled={scope.length === 0 || dimensions.length === 0}
                onClick={run}
              >
                Generate draft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
