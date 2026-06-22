"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  Library,
  Loader2,
  PanelLeftClose,
  Play,
  RefreshCw,
  X,
} from "lucide-react"

import {
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  fetchZoteroItems,
  fetchZoteroSyncState,
  getZoteroIndexJob,
  listNarrations,
  listPapers,
  mappedKeys,
  startZoteroIndex,
  type ZoteroCollection,
  type ZoteroItem,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "@/app/ask/workspace/WorkspaceProvider"
import styles from "./ZoteroNavigator.module.css"

export const NAV_WIDTH_EXPANDED = 268
export const NAV_WIDTH_COLLAPSED = 44

type Props = {
  collapsed: boolean
  onToggleCollapse: () => void
  leftOffset: number
  topOffset?: number
}

export default function ZoteroNavigator({
  collapsed,
  onToggleCollapse,
  leftOffset,
  topOffset = 0,
}: Props) {
  const { selectedKeys, toggle, setMany, clear, indexedKeys, markIndexed } = useZoteroSelection()
  const { setMode, setActiveArtifact } = useWorkspace()

  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [items, setItems] = useState<Record<number, ZoteroItem[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indexing, setIndexing] = useState<Set<string>>(new Set())
  const [narrations, setNarrations] = useState<Map<string, { jobId: string; title: string }>>(new Map())
  const [mapped, setMapped] = useState<Set<string>>(new Set())
  const [selectedOpen, setSelectedOpen] = useState(false)
  const [titleByKey, setTitleByKey] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cols, sync, narr, corpus, maps] = await Promise.all([
        fetchZoteroCollections(),
        fetchZoteroSyncState(),
        listNarrations(),
        listPapers(),
        mappedKeys(),
      ])
      setCollections(cols.collections)
      markIndexed(sync.indexedKeys)
      setNarrations(new Map(narr.items.map((n) => [n.docId, { jobId: n.jobId, title: n.title }])))
      setMapped(new Set(maps.keys))
      setTitleByKey((prev) => {
        const next = new Map(prev)
        corpus.papers.forEach((p) => next.set(p.docId, p.title))
        return next
      })
    } catch {
      setError("Couldn't load your Zotero library. Is the mount set?")
    } finally {
      setLoading(false)
    }
  }, [markIndexed])

  useEffect(() => {
    void load()
  }, [load])

  // Index the not-yet-indexed of `keys` in the background, then mark them indexed.
  const autoIndex = useCallback(
    async (keys: string[]) => {
      const fresh = keys.filter((k) => !indexedKeys.has(k))
      if (!fresh.length) return
      setIndexing((prev) => new Set([...prev, ...fresh]))
      try {
        const { jobId } = await startZoteroIndex(fresh)
        for (;;) {
          await new Promise((r) => setTimeout(r, 1200))
          const job = await getZoteroIndexJob(jobId)
          if (job.status === "done") {
            markIndexed(fresh)
            break
          }
          if (job.status === "error") {
            setError(`Indexing failed: ${job.error ?? ""}`)
            break
          }
        }
      } catch {
        setError("Indexing failed.")
      } finally {
        setIndexing((prev) => {
          const next = new Set(prev)
          fresh.forEach((k) => next.delete(k))
          return next
        })
      }
    },
    [indexedKeys, markIndexed],
  )

  const loadItems = useCallback(
    async (collectionId: number): Promise<ZoteroItem[]> => {
      if (items[collectionId]) return items[collectionId]
      const r = await fetchZoteroItems(collectionId)
      setItems((prev) => ({ ...prev, [collectionId]: r.items }))
      setTitleByKey((prev) => {
        const next = new Map(prev)
        r.items.forEach((it) => {
          if (it.title) next.set(it.itemKey, it.title)
        })
        return next
      })
      return r.items
    },
    [items],
  )

  const toggleExpand = useCallback(
    (col: ZoteroCollection) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.has(col.collectionID) ? next.delete(col.collectionID) : next.add(col.collectionID)
        return next
      })
      void loadItems(col.collectionID)
    },
    [loadItems],
  )

  // Select (or clear) every indexable item in a collection, recursively.
  const selectCollection = useCallback(
    async (col: ZoteroCollection) => {
      try {
        const { itemKeys } = await fetchZoteroIndexableKeys(col.collectionID)
        if (!itemKeys.length) return
        const allSelected = itemKeys.every((k) => selectedKeys.has(k))
        setMany(itemKeys, !allSelected)
        if (!allSelected) void autoIndex(itemKeys)
      } catch {
        setError("Couldn't resolve that collection.")
      }
    },
    [selectedKeys, setMany, autoIndex],
  )

  const toggleItem = useCallback(
    (item: ZoteroItem) => {
      const willSelect = !selectedKeys.has(item.itemKey)
      toggle(item.itemKey)
      if (willSelect) void autoIndex([item.itemKey])
    },
    [selectedKeys, toggle, autoIndex],
  )

  if (collapsed) {
    return (
      <aside
        className={styles.rail}
        style={{ left: leftOffset, top: topOffset, width: NAV_WIDTH_COLLAPSED }}
      >
        <button
          type="button"
          className={styles.railBtn}
          onClick={onToggleCollapse}
          title="Open library"
          aria-label="Open library"
        >
          <Library size={18} />
        </button>
        {selectedKeys.size > 0 ? <span className={styles.railCount}>{selectedKeys.size}</span> : null}
      </aside>
    )
  }

  const renderCollection = (col: ZoteroCollection, depth: number) => {
    const isOpen = expanded.has(col.collectionID)
    const rows = items[col.collectionID]
    return (
      <div key={col.collectionID}>
        <div className={styles.colRow} style={{ paddingLeft: 8 + depth * 12 }}>
          <button
            type="button"
            className={styles.twisty}
            onClick={() => toggleExpand(col)}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight size={14} className={isOpen ? styles.twistyOpen : ""} />
          </button>
          <button type="button" className={styles.colName} onClick={() => selectCollection(col)} title="Select this collection">
            <span className={styles.colLabel}>{col.name}</span>
            {typeof col.itemCount === "number" && col.itemCount > 0 ? (
              <span className={styles.countBadge}>
                {col.indexedCount ?? 0}/{col.itemCount}
              </span>
            ) : null}
          </button>
        </div>

        {isOpen ? (
          <div>
            {col.children.map((child) => renderCollection(child, depth + 1))}
            {rows === undefined ? (
              <div className={styles.itemMuted} style={{ paddingLeft: 26 + depth * 12 }}>
                <Loader2 size={12} className={styles.spin} /> loading…
              </div>
            ) : rows.length === 0 && col.children.length === 0 ? (
              <div className={styles.itemMuted} style={{ paddingLeft: 26 + depth * 12 }}>
                no PDF items
              </div>
            ) : (
              rows.map((item) => {
                const isSel = selectedKeys.has(item.itemKey)
                const isIdx = indexedKeys.has(item.itemKey)
                const isBusy = indexing.has(item.itemKey)
                return (
                  <label
                    key={item.itemKey}
                    className={`${styles.itemRow} ${item.isBookDefaultOff ? styles.itemBook : ""}`}
                    style={{ paddingLeft: 26 + depth * 12 }}
                    title={item.isBookDefaultOff ? "Book — opt in to index" : item.title ?? item.itemKey}
                  >
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={isSel}
                      onChange={() => toggleItem(item)}
                    />
                    <span className={styles.itemTitle}>
                      {item.title ?? item.itemKey}
                      {item.year ? <span className={styles.itemYear}> · {item.year}</span> : null}
                    </span>
                    {narrations.has(item.itemKey) ? (
                      <button
                        type="button"
                        className={styles.playBtn}
                        title="Play narration"
                        aria-label="Play narration"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const n = narrations.get(item.itemKey)!
                          setMode("narrate")
                          setActiveArtifact({
                            kind: "narration",
                            docId: item.itemKey,
                            jobId: n.jobId,
                            title: n.title || item.title || "",
                          })
                        }}
                      >
                        <Play size={12} />
                      </button>
                    ) : null}
                    {mapped.has(item.itemKey) ? (
                      <span
                        className={styles.mappedDot}
                        title="Mapped — references fetched from OpenAlex"
                        aria-label="Mapped"
                      />
                    ) : null}
                    {isBusy ? (
                      <Loader2 size={12} className={styles.spin} />
                    ) : isIdx ? (
                      <span className={styles.idxBadge}>indexed</span>
                    ) : item.isBookDefaultOff ? (
                      <span className={styles.bookBadge}>book</span>
                    ) : null}
                  </label>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <aside className={styles.pane} style={{ left: leftOffset, top: topOffset, width: NAV_WIDTH_EXPANDED }}>
      <header className={styles.head}>
        <span className={styles.headTitle}>Library</span>
        <div className={styles.headActions}>
          <button type="button" className={styles.iconBtn} onClick={() => void load()} title="Refresh" aria-label="Refresh">
            <RefreshCw size={14} />
          </button>
          <button type="button" className={styles.iconBtn} onClick={onToggleCollapse} title="Collapse" aria-label="Collapse">
            <PanelLeftClose size={15} />
          </button>
        </div>
      </header>

      {selectedKeys.size > 0 ? (
        <div className={styles.selected}>
          <div className={styles.selectedHead}>
            <button
              type="button"
              className={styles.selectedToggle}
              onClick={() => setSelectedOpen((v) => !v)}
              aria-expanded={selectedOpen}
            >
              <ChevronRight size={13} className={selectedOpen ? styles.selectedChevronOpen : styles.selectedChevron} />
              Selected · {selectedKeys.size}
              {indexing.size > 0 ? (
                <span className={styles.scopeIndexing}> · indexing {indexing.size}…</span>
              ) : null}
            </button>
            <button type="button" className={styles.clearBtn} onClick={clear}>
              Clear
            </button>
          </div>
          {selectedOpen ? (
            <div className={styles.selectedList}>
              {Array.from(selectedKeys).map((key) => (
                <div key={key} className={styles.selectedRow}>
                  <span className={styles.selectedTitle} title={titleByKey.get(key) || key}>
                    {titleByKey.get(key) || key}
                  </span>
                  {indexing.has(key) ? <Loader2 size={11} className={styles.spin} /> : null}
                  <button
                    type="button"
                    className={styles.selectedRemove}
                    aria-label="Remove from selection"
                    onClick={() => setMany([key], false)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.scopeBarMuted}>Select papers to scope your questions</div>
      )}

      <div className={styles.tree}>
        {loading ? (
          <div className={styles.itemMuted}><Loader2 size={12} className={styles.spin} /> loading library…</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : collections.length === 0 ? (
          <div className={styles.itemMuted}>No collections found.</div>
        ) : (
          collections.map((col) => renderCollection(col, 0))
        )}
      </div>
    </aside>
  )
}
