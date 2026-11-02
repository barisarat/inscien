"use client"

import { memo, useEffect, useMemo, useState, type RefObject } from "react"

import { bundleFileUrl, fetchCitations, type Anchors, type Citations, type Cue } from "@/lib/api"
import CitationCard from "./CitationCard"
import styles from "./listen.module.css"

// Where the sentence being spoken sits on the original page. Sentence rects when the aligner
// found them inside the paragraph, the paragraph's own otherwise - a coarser highlight on the
// right page beats none - and NOTHING when neither exists (the spoken title line, "End of
// paper."). Never a guess.
export function resolveHighlight(cues: Cue[], anchors: Anchors | null, index: number) {
  if (!anchors || index < 0 || index >= cues.length) return null
  const exact = anchors.cues?.[index] ?? null
  const rects = exact ?? anchors.nodes?.[String(cues[index].node)]?.rects ?? null
  if (!rects || !rects.length) return null
  // The key is what makes this cheap: every sentence of one paragraph resolves to the same
  // coarse key, so the boxes are not rebuilt on each cue.
  return { key: exact ? `c${index}` : `n${cues[index].node}`, rects, exact: Boolean(exact) }
}

function SourcePane({
  slug,
  anchors,
  highlight,
  zoom,
  follow,
  paneRef,
}: {
  slug: string
  anchors: Anchors
  highlight: ReturnType<typeof resolveHighlight>
  zoom: number
  follow: boolean
  paneRef: RefObject<HTMLDivElement | null>
}) {
  const key = highlight?.key ?? null
  // The paper's citation markers, each a hover card over the page image. A paper that is not
  // built (or a failed read) has none, and the pane is as it was.
  const [citations, setCitations] = useState<Citations | null>(null)
  useEffect(() => {
    let live = true
    fetchCitations(slug)
      .then((c) => live && setCitations(c))
      .catch(() => live && setCitations(null))
    return () => {
      live = false
    }
  }, [slug])

  // Keep the highlight in view by scrolling the PANE, and only once it has left a comfortable
  // band - a paragraph spanning two pages should not yank on every sentence.
  useEffect(() => {
    if (!follow || !key) return
    const pane = paneRef.current
    const first = pane?.querySelector<HTMLElement>(`.${styles.highlight}`)
    if (!pane || !first) return
    const hl = first.getBoundingClientRect()
    const box = pane.getBoundingClientRect()
    if (hl.top < box.top + 40 || hl.bottom > box.bottom - 60) {
      pane.scrollTop += hl.top - box.top - box.height / 3
    }
  }, [key, follow, paneRef, zoom])

  const boxes = useMemo(() => {
    if (!highlight) return new Map<number, React.ReactNode[]>()
    const byPage = new Map<number, React.ReactNode[]>()
    highlight.rects.forEach((r, i) => {
      const size = anchors.pages[r.page - 1]
      if (!size) return
      const list = byPage.get(r.page) ?? []
      list.push(
        <div
          key={i}
          className={highlight.exact ? styles.highlight : `${styles.highlight} ${styles.coarse}`}
          style={{
            left: `${(r.x0 / size.width) * 100}%`,
            top: `${(r.y0 / size.height) * 100}%`,
            width: `${((r.x1 - r.x0) / size.width) * 100}%`,
            height: `${((r.y1 - r.y0) / size.height) * 100}%`,
          }}
        />
      )
      byPage.set(r.page, list)
    })
    return byPage
  }, [highlight, anchors])

  const cites = useMemo(() => {
    const byPage = new Map<number, React.ReactNode[]>()
    if (!citations) return byPage
    citations.citations.forEach((c, i) => {
      const size = anchors.pages[c.page]
      const references = c.refs.map((n) => citations.references[String(n)]).filter(Boolean)
      if (!size || !references.length) return
      const list = byPage.get(c.page) ?? []
      c.rects.forEach(([x0, y0, x1, y1], j) =>
        list.push(
          <CitationCard
            key={`${i}-${j}`}
            references={references}
            style={{
              left: `${(x0 / size.width) * 100}%`,
              top: `${(y0 / size.height) * 100}%`,
              width: `${((x1 - x0) / size.width) * 100}%`,
              height: `${((y1 - y0) / size.height) * 100}%`,
            }}
          />
        )
      )
      byPage.set(c.page, list)
    })
    return byPage
  }, [citations, anchors])

  return (
    <div ref={paneRef} className="h-full overflow-auto pt-4" style={{ ["--zoom" as string]: zoom }}>
      {anchors.images.map((name, i) => {
        const size = anchors.pages[i] ?? { width: 1, height: 1 }
        return (
          <div
            key={name}
            className={styles.page}
            style={{ aspectRatio: `${size.width}/${size.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" src={bundleFileUrl(slug, `pages/${name}`)} alt={`page ${i + 1}`} />
            {boxes.get(i + 1)}
            {cites.get(i)}
          </div>
        )
      })}
    </div>
  )
}

export default memo(SourcePane)
