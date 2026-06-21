"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

// The active "working set" — the Zotero items every skill is scoped to. Mirrors the
// SidebarProvider pattern: a small client context, sessionStorage-backed for in-tab
// continuity. `indexedKeys` tracks what the backend has indexed so the navigator can
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
}

const ZoteroSelectionContext = createContext<ZoteroSelectionValue>({
  selectedKeys: new Set(),
  isSelected: () => false,
  toggle: () => {},
  setMany: () => {},
  clear: () => {},
  indexedKeys: new Set(),
  markIndexed: () => {},
})

export function ZoteroSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [indexedKeys, setIndexedKeys] = useState<Set<string>>(new Set())
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (raw) setSelectedKeys(new Set(JSON.parse(raw) as string[]))
    } catch {}
    setSettled(true)
  }, [])

  useEffect(() => {
    if (!settled) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedKeys]))
    } catch {}
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
      value={{ selectedKeys, isSelected, toggle, setMany, clear, indexedKeys, markIndexed }}
    >
      {children}
    </ZoteroSelectionContext.Provider>
  )
}

export function useZoteroSelection(): ZoteroSelectionValue {
  return useContext(ZoteroSelectionContext)
}
