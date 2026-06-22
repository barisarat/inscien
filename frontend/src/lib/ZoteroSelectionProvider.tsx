"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

// The active "working set" — the Zotero items every skill is scoped to. A small client
// context, sessionStorage-backed for in-tab continuity. `indexedKeys` tracks what the
// backend has indexed so the navigator can
// badge items and auto-index only the not-yet-indexed ones.
const STORAGE_KEY = "inscien-zotero-selection"

interface ZoteroSelectionValue {
  selectedKeys: Set<string>
  isSelected: (key: string) => boolean
  toggle: (key: string) => void
  setMany: (keys: string[], on: boolean) => void
  clear: () => void
  indexedKeys: Set<string>
  markIndexed: (keys: string[]) => void
  // True when persisting the selection to sessionStorage failed (private mode / quota /
  // blocked storage): the selection still works in-tab but won't survive a reload.
  persistError: boolean
}

const ZoteroSelectionContext = createContext<ZoteroSelectionValue>({
  selectedKeys: new Set(),
  isSelected: () => false,
  toggle: () => {},
  setMany: () => {},
  clear: () => {},
  indexedKeys: new Set(),
  markIndexed: () => {},
  persistError: false,
})

export function ZoteroSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [indexedKeys, setIndexedKeys] = useState<Set<string>>(new Set())
  const [settled, setSettled] = useState(false)
  const [persistError, setPersistError] = useState(false)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      // SSR-safe rehydration: sessionStorage only exists client-side, so we restore the saved
      // selection in an effect (after mount) rather than a lazy initializer that would crash
      // SSR / cause a hydration mismatch. The rule's synchronous-setState warning is a false
      // positive for this intentional pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSelectedKeys(new Set(JSON.parse(raw) as string[]))
    } catch (e) {
      console.warn("Couldn't restore saved paper selection from sessionStorage:", e)
    }
    setSettled(true)
  }, [])

  useEffect(() => {
    if (!settled) return
    let ok = true
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedKeys]))
    } catch (e) {
      console.warn("Couldn't persist paper selection to sessionStorage:", e)
      ok = false
    }
    // Syncing persist-status to React from an external system (sessionStorage); React bails
    // out of a re-render when the value is unchanged. Same intentional pattern as the read
    // effect above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersistError(!ok)
  }, [selectedKeys, settled])

  const toggle = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const setMany = useCallback((keys: string[], on: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)))
      return next
    })
  }, [])

  const clear = useCallback(() => setSelectedKeys(new Set()), [])

  const markIndexed = useCallback((keys: string[]) => {
    setIndexedKeys((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => next.add(k))
      return next
    })
  }, [])

  const isSelected = useCallback((key: string) => selectedKeys.has(key), [selectedKeys])

  return (
    <ZoteroSelectionContext.Provider
      value={{ selectedKeys, isSelected, toggle, setMany, clear, indexedKeys, markIndexed, persistError }}
    >
      {children}
    </ZoteroSelectionContext.Provider>
  )
}

export function useZoteroSelection(): ZoteroSelectionValue {
  return useContext(ZoteroSelectionContext)
}
