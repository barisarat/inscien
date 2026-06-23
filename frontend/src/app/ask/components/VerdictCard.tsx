"use client"

import { ExternalLink } from "lucide-react"

import { type VerifyEvidence, type VerifyPaper, type VerifyResult, type VerifyVerdict } from "@/lib/api"
import styles from "./VerdictCard.module.css"

// One completed verification, rendered as a sober report (not a dashboard): a calibrated
// summary line, then evidence grouped by verdict. Each evidence row carries the quoted
// passage (the proof) + a page link that opens the source PDF at that page.
const GROUPS: { verdict: VerifyVerdict; label: string; glyph: string }[] = [
  { verdict: "supports", label: "Supporting", glyph: "●" },
  { verdict: "contradicts", label: "Conflicting", glyph: "✕" },
  { verdict: "mixed", label: "Mixed", glyph: "◐" },
  { verdict: "not_addressed", label: "Doesn’t address", glyph: "—" },
]

export default function VerdictCard({
  result,
  onOpenSource,
}: {
  result: VerifyResult
  onOpenSource: (e: { sourceId?: string; title: string; page?: number | null; passage?: string; bbox?: number[] | null }) => void
}) {
  return (
    <article className={styles.card}>
      <h3 className={styles.claim}>{result.claim}</h3>
      {result.summary ? <p className={styles.summary}>{result.summary}</p> : null}

      {GROUPS.map((group) => {
        const papers = result.papers.filter((p) => p.verdict === group.verdict)
        if (papers.length === 0) return null
        return (
          <section key={group.verdict} className={styles.group}>
            <h4 className={styles.groupLabel}>
              <span className={styles.glyph} aria-hidden>{group.glyph}</span> {group.label}
            </h4>
            {group.verdict === "not_addressed" ? (
              <p className={styles.notAddressed}>{papers.map((p) => p.title).join(" · ")}</p>
            ) : (
              papers.map((paper) => (
                <PaperEvidence key={paper.docId} paper={paper} onOpenSource={onOpenSource} />
              ))
            )}
          </section>
        )
      })}
    </article>
  )
}

function PaperEvidence({
  paper,
  onOpenSource,
}: {
  paper: VerifyPaper
  onOpenSource: (e: { sourceId?: string; title: string; page?: number | null; passage?: string; bbox?: number[] | null }) => void
}) {
  return (
    <div className={styles.paper}>
      <div className={styles.paperTitle} title={paper.title}>{paper.title}</div>
      {paper.evidence.map((ev: VerifyEvidence, i) => {
        const pageLabel = ev.page != null ? `p. ${ev.page}` : null
        return (
          <div key={i} className={styles.row}>
            {paper.verdict === "mixed" ? (
              <span className={styles.stance}>{ev.stance === "contradicting" ? "but" : "supports"}</span>
            ) : null}
            <blockquote className={styles.passage}>{ev.passage}</blockquote>
            {ev.sourceId ? (
              <button
                type="button"
                className={styles.pageLink}
                title={`Open the source${pageLabel ? ` at ${pageLabel}` : ""}`}
                onClick={() =>
                  onOpenSource({ sourceId: ev.sourceId, title: paper.title, page: ev.page, passage: ev.passage, bbox: ev.bbox })
                }
              >
                <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
                {pageLabel ? <span>{pageLabel}</span> : null}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
