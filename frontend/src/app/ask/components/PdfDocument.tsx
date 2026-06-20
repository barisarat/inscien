"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

import { pdfjs } from "@/lib/pdfWorker" // side effect: sets the offline workerSrc
import styles from "./PdfViewerPanel.module.css"

void pdfjs

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[…]+$/, "").trim()
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Renders the full PDF, scrollable, and:
 *  - auto-scrolls to `targetPage`,
 *  - highlights the cited `passage` on that page via pdf.js's own text layer (B2):
 *    a customTextRenderer wraps text items whose text is part of the passage. pdf.js
 *    owns the geometry, so there is no coordinate mapping.
 */
export default function PdfDocument({
  fileUrl,
  targetPage,
  passage,
}: {
  fileUrl: string
  targetPage: number
  passage?: string
}) {
  const [numPages, setNumPages] = useState(0)
  const [width, setWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const normalizedPassage = passage ? normalize(passage) : ""
  // A distinctive short needle (first ~8 words) — fallback when whole-line containment
  // misses on hyphenated / two-column text.
  const needle = normalizedPassage.split(" ").slice(0, 8).join(" ")

  // Track container width so pages fit the panel. Defer to rAF and only update on a
  // real change so measuring → setState → relayout can't feed back into an infinite
  // loop ("Maximum update depth exceeded"). contentRect already excludes padding.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = Math.round(entries[0]?.contentRect.width ?? 0)
        setWidth((prev) => (prev === next ? prev : next))
      })
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const scrollToTarget = useCallback(() => {
    containerRef.current
      ?.querySelector(`#pg-${targetPage}`)
      ?.scrollIntoView({ block: "start" })
  }, [targetPage])

  // Re-scroll when the citation jumps to a different page in an already-loaded doc.
  useEffect(() => {
    if (numPages > 0) {
      const id = window.setTimeout(scrollToTarget, 60)
      return () => window.clearTimeout(id)
    }
  }, [targetPage, numPages, scrollToTarget])

  const highlightRenderer = useCallback(
    (item: { str: string }) => {
      const raw = item.str || ""
      const norm = normalize(raw)
      const hit =
        norm.length >= 4 &&
        (normalizedPassage.includes(norm) || (needle.length > 0 && norm.includes(needle)))
      return hit
        ? `<mark class="${styles.inscienHighlight}">${escapeHtml(raw)}</mark>`
        : escapeHtml(raw)
    },
    [normalizedPassage, needle],
  )

  return (
    <div className={styles.docScroll} ref={containerRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={<div className={styles.docStatus}>Loading PDF…</div>}
        error={<div className={styles.docStatus}>Couldn’t load this PDF.</div>}
      >
        {Array.from({ length: numPages }, (_, i) => {
          const page = i + 1
          const isTarget = page === targetPage
          return (
            <div id={`pg-${page}`} key={page} className={styles.pageWrap}>
              <Page
                pageNumber={page}
                width={width || undefined}
                renderAnnotationLayer={false}
                customTextRenderer={
                  isTarget && normalizedPassage ? highlightRenderer : undefined
                }
                onRenderSuccess={isTarget ? scrollToTarget : undefined}
              />
            </div>
          )
        })}
      </Document>
    </div>
  )
}
