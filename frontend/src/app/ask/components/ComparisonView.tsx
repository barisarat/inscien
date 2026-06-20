"use client"

import { ExternalLink } from "lucide-react"

import { type CompareCitation, type CompareResult } from "@/lib/api"
import styles from "./ComparisonView.module.css"

// The grounded comparison table rendered in the right work-panel: dimensions read down
// the left, one column per paper. Every filled cell carries a page-precise citation —
// clicking it opens the source PDF at that page (via onOpenCell). Cells the paper does
// not report show "Not reported" with no link (the pipeline never fabricates).
export default function ComparisonView({
  data,
  onOpenCell,
}: {
  data: CompareResult
  onOpenCell: (citation: CompareCitation) => void
}) {
  const { papers, dimensions, cells, synthesis } = data

  return (
    <div className={styles.wrap}>
      {synthesis ? (
        <section className={styles.synthesis}>
          <div className={styles.synthesisTitle}>Summary</div>
          <p className={styles.synthesisText}>{synthesis}</p>
        </section>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cornerCell} />
              {papers.map((p) => (
                <th key={p.docId} className={styles.paperHead} title={p.title}>
                  {p.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dimensions.map((dim) => (
              <tr key={dim}>
                <th className={styles.dimHead} scope="row">
                  {dim}
                </th>
                {papers.map((p) => {
                  const cell = cells[p.docId]?.[dim]
                  const value = cell?.value ?? "Not reported"
                  const citation = cell?.citation ?? null
                  const reported = Boolean(citation)
                  const pageLabel = citation?.page != null ? `p. ${citation.page}` : null

                  return (
                    <td key={p.docId} className={styles.cell}>
                      <span className={reported ? styles.value : styles.valueMuted}>{value}</span>
                      {citation ? (
                        <button
                          type="button"
                          className={styles.cite}
                          title={`Open the source${pageLabel ? ` at ${pageLabel}` : ""}`}
                          onClick={() => onOpenCell(citation)}
                        >
                          <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
                          {pageLabel ? <span>{pageLabel}</span> : null}
                        </button>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
