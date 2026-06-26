"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

import { pdfjs } from "@/lib/pdfWorker" // side effect: sets the offline workerSrc
import styles from "./PdfViewerPanel.module.css"

void pdfjs

// react-pdf hands the render callback a PDFPageProxy augmented with rendered + original
// dimensions; we only need these few fields to map PDF-point coords onto rendered pixels.
type RenderedPage = { pageNumber: number; width: number; originalWidth: number }

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[...]+$/, "").trim()
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Renders the full PDF, scrollable, and highlights the cited passage on `targetPage`:
 *  - PRIMARY: when a `bbox` ([x0,y0,x1,y1] in PDF points, PyMuPDF top-left origin) is known,
 *    draw a rectangle overlay at bboxxscale - immune to hyphenation / two-column reflow.
 *    scale = renderedWidth / originalWidth, captured per page from react-pdf's render
 *    callback (no Y-flip: PyMuPDF and the rendered DOM share a top-left origin).
 *  - FALLBACK: no bbox -> the legacy text-layer match (a customTextRenderer wraps items whose
 *    text is part of the passage).
 *  - HONEST MISS: no bbox and the text match found nothing -> a small note, so a miss is
 *    visible instead of silent. The page still scrolls into view either way.
 */
export default function PdfDocument({
  fileUrl,
  targetPage,
  passage,
  bbox,
}: {
  fileUrl: string
  targetPage: number
  passage?: string
  bbox?: number[] | null
}) {
  const [numPages, setNumPages] = useState(0)
  const [width, setWidth] = useState(0)
  // Render scale (renderedPx / PDF points) per page number, captured on render success.
  const [scaleByPage, setScaleByPage] = useState<Record<number, number>>({})
  const [showMiss, setShowMiss] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // Set during the target page's text render when a passage fragment is wrapped; read after
  // render to decide the honest-miss note. Reset whenever the target/passage changes.
  const matchedRef = useRef(false)

  const hasBbox = Array.isArray(bbox) && bbox.length === 4
  const normalizedPassage = passage ? normalize(passage) : ""
  // A distinctive short needle (first ~8 words) - fallback when whole-line containment
  // misses on hyphenated / two-column text.
  const needle = normalizedPassage.split(" ").slice(0, 8).join(" ")

  // Track container width so pages fit the panel. Defer to rAF and only update on a
  // real change so measuring -> setState -> relayout can't feed back into an infinite
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

  // Re-scroll when the citation jumps to a different page in an already-loaded doc, and
  // reset the per-citation highlight state (match flag + stale miss note).
  useEffect(() => {
    matchedRef.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowMiss(false)
    if (numPages > 0) {
      const id = window.setTimeout(scrollToTarget, 60)
      return () => window.clearTimeout(id)
    }
  }, [targetPage, passage, bbox, numPages, scrollToTarget])

  // Capture each page's render scale once it paints; on the target page, also resolve the
  // honest-miss note (only relevant on the text-match fallback path).
  const handleRenderSuccess = useCallback(
    (page: RenderedPage) => {
      const scale = page.originalWidth > 0 ? page.width / page.originalWidth : 0
      setScaleByPage((prev) => (prev[page.pageNumber] === scale ? prev : { ...prev, [page.pageNumber]: scale }))
      if (page.pageNumber === targetPage) {
        // Scroll once the target has actually painted (it now has real height), and resolve
        // the honest-miss note (only relevant on the text-match fallback path).
        scrollToTarget()
        setShowMiss(!hasBbox && !!normalizedPassage && !matchedRef.current)
      }
    },
    [targetPage, hasBbox, normalizedPassage, scrollToTarget],
  )

  const highlightRenderer = useCallback(
    (item: { str: string }) => {
      const raw = item.str || ""
      const norm = normalize(raw)
      const hit =
        norm.length >= 4 &&
        (normalizedPassage.includes(norm) || (needle.length > 0 && norm.includes(needle)))
      if (hit) matchedRef.current = true
      return hit
        ? `<mark class="${styles.inscienHighlight}">${escapeHtml(raw)}</mark>`
        : escapeHtml(raw)
    },
    [normalizedPassage, needle],
  )

  const targetScale = scaleByPage[targetPage] ?? 0
  // Overlay rect in rendered pixels, relative to the (position:relative) page wrapper.
  const overlayStyle =
    hasBbox && targetScale > 0
      ? {
          left: bbox![0] * targetScale,
          top: bbox![1] * targetScale,
          width: (bbox![2] - bbox![0]) * targetScale,
          height: (bbox![3] - bbox![1]) * targetScale,
        }
      : null

  return (
    <div className={styles.docScroll} ref={containerRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={<div className={styles.docStatus}>Loading PDF...</div>}
        error={<div className={styles.docStatus}>Could not load this PDF.</div>}
      >
        {Array.from({ length: numPages }, (_, i) => {
          const page = i + 1
          const isTarget = page === targetPage
          // Run the text-match highlight whenever there's a passage: it refines within the
          // bbox region box when present, and is the sole highlight when bbox is absent.
          const useTextMatch = isTarget && !!normalizedPassage
          return (
            <div id={`pg-${page}`} key={page} className={styles.pageWrap}>
              <Page
                pageNumber={page}
                width={width || undefined}
                renderAnnotationLayer={false}
                customTextRenderer={useTextMatch ? highlightRenderer : undefined}
                onRenderSuccess={handleRenderSuccess}
              />
              {isTarget && overlayStyle ? (
                <div className={styles.bboxOverlay} style={overlayStyle} aria-hidden />
              ) : null}
              {isTarget && showMiss ? (
                <div className={styles.locateNote}>
                  Could not pinpoint the exact passage on this page.
                </div>
              ) : null}
            </div>
          )
        })}
      </Document>
    </div>
  )
}
