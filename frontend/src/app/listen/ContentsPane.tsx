"use client"

import { memo, useEffect, useMemo, useRef } from "react"

import type { Cue } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface OutlineEntry {
  text: string
  level: number
  start: number
  cue: number
}

// Headings only, and a heading is always exactly one cue - the same rule as the builder's
// cues.outline(). Derived here so the bundle needs to ship nothing extra.
export function buildOutline(cues: Cue[]): OutlineEntry[] {
  return cues
    .map((c, i) => ({ text: c.display, level: c.level || 1, start: c.start, cue: i }))
    .filter((_, i) => cues[i].type === "heading" && cues[i].sent === 0)
}

function ContentsPane({
  outline,
  current,
  onJump,
}: {
  outline: OutlineEntry[]
  current: number
  onJump: (entry: OutlineEntry) => void
}) {
  const navRef = useRef<HTMLElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Last heading at or before the current cue - the same "last one that has started" rule the
  // sentence highlight uses.
  const activeCue = useMemo(() => {
    let active = -1
    for (const item of outline) if (item.cue <= current) active = item.cue
    return active
  }, [outline, current])

  // Scroll the outline ITSELF, never scrollIntoView: that walks every scrollable ancestor, and
  // where the outline is an in-flow block (the phone's sheet) it yanked the whole page to the
  // top on every sentence.
  useEffect(() => {
    const nav = navRef.current
    const item = activeRef.current
    if (!nav || !item) return
    const box = nav.getBoundingClientRect()
    const row = item.getBoundingClientRect()
    if (row.top < box.top || row.bottom > box.bottom) {
      nav.scrollTop += row.top - box.top - (box.height - row.height) / 2
    }
  }, [activeCue])

  return (
    <nav ref={navRef} className="flex h-full flex-col gap-0.5 overflow-y-auto py-4 pr-3 text-sm">
      {outline.map((item) => {
        const here = item.cue === activeCue
        return (
          <button
            key={item.cue}
            ref={here ? activeRef : undefined}
            type="button"
            onClick={() => onJump(item)}
            style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
            className={cn(
              "cursor-pointer rounded-md py-1 pr-2 text-left leading-snug transition-colors hover:bg-muted",
              here ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {item.text}
          </button>
        )
      })}
    </nav>
  )
}

export default memo(ContentsPane)
