"use client"

import { memo, useMemo, type RefObject } from "react"

import type { Cue } from "@/lib/api"
import styles from "./listen.module.css"

// Cues are grouped back into their source blocks so each renders as one paragraph - the same
// grouping the builder used to do in Python.
function paragraphs(cues: Cue[]): { node: number; type: string; items: [number, Cue][] }[] {
  const groups: { node: number; type: string; items: [number, Cue][] }[] = []
  let current: { node: number; type: string; items: [number, Cue][] } | null = null
  cues.forEach((cue, i) => {
    if (!current || cue.node !== current.node) {
      current = { node: cue.node, type: cue.type, items: [] }
      groups.push(current)
    }
    current.items.push([i, cue])
  })
  return groups
}

// The active sentence is marked by toggling classes on these nodes from the parent, NOT by
// re-rendering: a three-hour paper is a few thousand spans and they change on every cue. The
// paragraph list is memoized on the cue array so switching voice (a new array) rebuilds it and
// nothing else does.
function NarrationPane({
  cues,
  containerRef,
  onSeek,
}: {
  cues: Cue[]
  containerRef: RefObject<HTMLDivElement | null>
  onSeek: (index: number) => void
}) {
  const groups = useMemo(() => paragraphs(cues), [cues])

  return (
    <div ref={containerRef} className={styles.narration}>
      {groups.map((group, gi) => {
        const kind = group.type
        const css = kind === "heading" || kind === "epigraph" || kind === "formula" ? styles[kind] : undefined
        return (
          <p key={gi} className={css} id={kind === "heading" ? `h${group.items[0][0]}` : undefined}>
            {group.items.map(([i, cue]) => (
              <span
                key={i}
                data-i={i}
                className={styles.sentence}
                onClick={() => onSeek(i)}
              >
                {cue.display}{" "}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

export default memo(NarrationPane)
