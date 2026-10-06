"use client"

import { memo, useEffect, useMemo, type RefObject } from "react"

import { bundleFileUrl, type Anchors, type Cue } from "@/lib/api"
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
          </div>
        )
      })}
    </div>
  )
}

export default memo(SourcePane)
