"use client"

import { useCallback, useEffect, useState } from "react"

// A view choice that belongs to this DEVICE rather than to the data: which panes are open, the
// zoom, a split, whether the sidebar shows its counts. Not selections, not positions - those
// are about the work and live on the server or in the selection provider.
//
// Reads happen after mount, never during render: a static export prerenders these pages at
// build time, and touching localStorage while rendering makes the first paint disagree with the
// DOM. That is also why every caller passes a sensible default rather than a null.
export function usePersisted<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // a private window, or a value written by an older build - keep the default
    }
  }, [key])

  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // storage disabled: the choice still applies for this session
      }
    },
    [key]
  )

  return [value, set]
}
