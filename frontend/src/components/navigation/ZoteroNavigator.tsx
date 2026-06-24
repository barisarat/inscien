"use client"

import { useCallback, useEffect, useState, type PointerEvent, type ReactNode } from "react"
import { BookOpen, Check, ChevronRight, Loader2, Map as MapIcon, Play, RefreshCw, X } from "lucide-react"

import {
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  fetchZoteroItems,
  fetchZoteroSyncState,
  getZoteroIndexJob,
  listNarrations,
  listPapers,
  mappedKeys,
  reconcileZotero,
  startZoteroIndex,
  type ZoteroCollection,
  type ZoteroItem,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { pollJob } from "@/lib/pollJob"
import { useWorkspace } from "@/app/map/workspace/WorkspaceProvider"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SIDEBAR_GUTTER = { paddingLeft: "1.5rem", paddingRight: "1.5rem" }

type Props = {
  onResizeStart?: (event: PointerEvent<HTMLButtonElement>) => void
}

function PaperStatusIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={label}
            role="img"
            className="inline-flex h-6 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          >
            {children}
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function ZoteroNavigator({ onResizeStart }: Props) {
  const { selectedKeys, toggle, setMany, clear, indexedKeys, markIndexed, persistError } = useZoteroSelection()
  const { setMode, setActiveArtifact } = useWorkspace()

  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [liveConnected, setLiveConnected] = useState(true)
  const [libraryMissing, setLibraryMissing] = useState(false)
  const [mountPath, setMountPath] = useState<string | null>(null)
  const [items, setItems] = useState<Record<number, ZoteroItem[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indexing, setIndexing] = useState<Set<string>>(new Set())
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null)
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
      setLiveConnected(cols.liveConnected !== false)
      setLibraryMissing(cols.libraryMissing === true)
      setMountPath(cols.mountPath ?? null)
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

  const handleReconcile = useCallback(async () => {
    setReconciling(true)
    setReconcileMsg(null)
    try {
      const r = await reconcileZotero()
      if (r.skipped) {
        setReconcileMsg(r.reason || "Nothing was removed.")
      } else if (!r.pruned) {
        setReconcileMsg("Nothing to clean up.")
      } else {
        setReconcileMsg(`Removed ${r.pruned} deleted ${r.pruned === 1 ? "paper" : "papers"} from the index.`)
        await load()
      }
    } catch (e) {
      setReconcileMsg(e instanceof Error ? e.message : "Cleanup failed.")
    } finally {
      setReconciling(false)
    }
  }, [load])

  const autoIndex = useCallback(
    async (keys: string[]) => {
      const fresh = keys.filter((k) => !indexedKeys.has(k))
      if (!fresh.length) return
      setIndexing((prev) => new Set([...prev, ...fresh]))
      try {
        const { jobId } = await startZoteroIndex(fresh)
        await pollJob(jobId, getZoteroIndexJob, {
          intervalMs: 1200,
          onDone: () => markIndexed(fresh),
          onError: (job) => setError(`Indexing failed: ${job.error ?? ""}`),
        })
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

  const renderCollection = (col: ZoteroCollection, depth: number) => {
    const isOpen = expanded.has(col.collectionID)
    const rows = items[col.collectionID]
    const pad = (n: number) => ({ paddingLeft: n + 8 + depth * 12 })
    return (
      <div key={col.collectionID}>
        <div className="flex items-center gap-0.5" style={pad(0)}>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-5 text-muted-foreground"
            onClick={() => toggleExpand(col)}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </Button>
          <SidebarMenuButton className="grid h-7 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_3.5rem] pr-4" onClick={() => selectCollection(col)} title="Select this collection">
            <span className="truncate">{col.name}</span>
            {typeof col.itemCount === "number" && col.itemCount > 0 ? (
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {col.indexedCount ?? 0}/{col.itemCount}
              </span>
            ) : null}
          </SidebarMenuButton>
        </div>

        {isOpen ? (
          <div>
            {col.children.map((child) => renderCollection(child, depth + 1))}
            {rows === undefined ? (
              <div className="flex items-center gap-1.5 py-1.5 text-xs text-muted-foreground" style={pad(26)}>
                <Loader2 className="size-3 animate-spin" /> Loading...
              </div>
            ) : rows.length === 0 && col.children.length === 0 ? (
              <div className="py-1.5 text-xs text-muted-foreground" style={pad(26)}>No PDF items</div>
            ) : (
              rows.map((item) => {
                const isSel = selectedKeys.has(item.itemKey)
                const isIdx = indexedKeys.has(item.itemKey)
                const isBusy = indexing.has(item.itemKey)
                return (
                  <div
                    key={item.itemKey}
                    className={`flex min-w-0 items-center gap-2 rounded-md py-1.5 pr-4 text-sm hover:bg-sidebar-accent ${item.isBookDefaultOff ? "opacity-60" : ""}`}
                    style={pad(26)}
                    title={item.isBookDefaultOff ? "Book - opt in to index" : item.title ?? item.itemKey}
                  >
                    <Checkbox checked={isSel} onCheckedChange={() => toggleItem(item)} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => toggleItem(item)}
                    >
                      {item.title ?? item.itemKey}
                      {item.year ? <span className="ml-1 text-muted-foreground">{item.year}</span> : null}
                    </button>
                    <div className="grid w-[6.25rem] shrink-0 grid-cols-3 items-center justify-items-center gap-1">
                      {narrations.has(item.itemKey) ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="!w-7"
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
                                <Play />
                              </Button>
                            }
                          />
                          <TooltipContent>Play narration</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="h-6 w-7" aria-hidden />
                      )}
                      {mapped.has(item.itemKey) ? (
                        <PaperStatusIcon label="Map data ready">
                          <MapIcon className="size-3.5" />
                        </PaperStatusIcon>
                      ) : (
                        <span className="h-6 w-7" aria-hidden />
                      )}
                      {isBusy ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" />
                      ) : isIdx ? (
                        <PaperStatusIcon label="Indexed locally">
                          <Check className="size-3.5" />
                        </PaperStatusIcon>
                      ) : item.isBookDefaultOff ? (
                        <PaperStatusIcon label="Book - opt in to index">
                          <BookOpen className="size-3.5" />
                        </PaperStatusIcon>
                      ) : (
                        <span className="h-6 w-7" aria-hidden />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" className="group/library-sidebar">
      {onResizeStart ? (
        <button
          type="button"
          aria-label="Resize library sidebar"
          className="absolute inset-y-0 right-0 z-20 hidden w-2 cursor-col-resize touch-none items-stretch justify-center after:block after:h-full after:w-px after:bg-transparent hover:after:bg-border md:flex"
          onPointerDown={onResizeStart}
        />
      ) : null}
      <SidebarHeader className="h-13 justify-center border-b py-0" style={SIDEBAR_GUTTER}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Library</span>
          <Button variant="ghost" size="icon-sm" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {selectedKeys.size > 0 ? (
          <SidebarGroup className="border-b py-3" style={SIDEBAR_GUTTER}>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2 text-xs font-medium"
                onClick={() => setSelectedOpen((v) => !v)}
                aria-expanded={selectedOpen}
              >
                <ChevronRight className={`size-3.5 transition-transform ${selectedOpen ? "rotate-90" : ""}`} />
                <span>{selectedKeys.size} selected</span>
                {indexing.size > 0 ? <span className="text-muted-foreground">Indexing {indexing.size}</span> : null}
              </Button>
              <Button variant="ghost" size="xs" onClick={clear}>Clear</Button>
            </div>
            {selectedOpen ? (
              <div className="mt-2 mb-2 flex flex-col gap-1">
                {Array.from(selectedKeys).map((key) => (
                  <div key={key} className="flex min-w-0 items-center gap-2 py-0.5 text-xs">
                    <span className="min-w-0 flex-1 truncate" title={titleByKey.get(key) || key}>
                      {titleByKey.get(key) || key}
                    </span>
                    {indexing.has(key) ? <Loader2 className="size-3 animate-spin" /> : null}
                    <Button variant="ghost" size="icon-xs" aria-label="Remove from selection" onClick={() => setMany([key], false)}>
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </SidebarGroup>
        ) : (
          <div className="py-2 text-xs text-muted-foreground" style={SIDEBAR_GUTTER}>Select papers to scope your map</div>
        )}

        {!loading && !error && libraryMissing ? (
          <div className="py-2 text-xs text-muted-foreground" style={SIDEBAR_GUTTER}>
            No Zotero library found{mountPath ? <> at <code>{mountPath}</code></> : null}. Set{" "}
            <code>ZOTERO_HOST_DIR</code> to your Zotero data directory and restart the stack - see the README.
          </div>
        ) : null}
        {!loading && !error && !liveConnected && !libraryMissing ? (
          <div className="py-2 text-xs text-muted-foreground" style={SIDEBAR_GUTTER}>
            Live Zotero library not connected - showing the last snapshot.
          </div>
        ) : null}
        {persistError ? (
          <div className="py-2 text-xs text-muted-foreground" style={SIDEBAR_GUTTER}>
            Your selection won't be saved across reloads - browser storage is blocked.
          </div>
        ) : null}

        <SidebarGroup className="py-2" style={SIDEBAR_GUTTER}>
          {loading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading library...</div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>
          ) : libraryMissing ? (
            <div className="text-xs text-muted-foreground">No library mounted yet.</div>
          ) : collections.length === 0 ? (
            <div className="text-xs text-muted-foreground">No collections found.</div>
          ) : (
            collections.map((col) => renderCollection(col, 0))
          )}
        </SidebarGroup>
      </SidebarContent>

      {!loading && !error && !libraryMissing ? (
        <SidebarFooter className="items-center border-t p-3">
          <Button variant="ghost" size="sm" className="justify-center" onClick={() => void handleReconcile()} disabled={reconciling}>
            {reconciling ? (<><Loader2 className="size-3 animate-spin" /> Cleaning up...</>) : "Clean up removed items"}
          </Button>
          {reconcileMsg ? <div className="px-2 text-xs text-muted-foreground">{reconcileMsg}</div> : null}
        </SidebarFooter>
      ) : null}
    </Sidebar>
  )
}
