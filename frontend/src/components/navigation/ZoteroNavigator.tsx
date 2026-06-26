"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { ChevronRight, Loader2, Play, RefreshCw, X } from "lucide-react"

import {
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  fetchZoteroItems,
  getGraphFetch,
  listNarrations,
  listPapers,
  mappedKeys,
  reconcileZotero,
  startLibraryPrefetch,
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

export default function ZoteroNavigator({ onResizeStart }: Props) {
  const { selectedKeys, toggle, setMany, clear, persistError } = useZoteroSelection()
  const { setMode, setActiveArtifact } = useWorkspace()

  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [liveConnected, setLiveConnected] = useState(true)
  const [libraryMissing, setLibraryMissing] = useState(false)
  const [mountPath, setMountPath] = useState<string | null>(null)
  const [items, setItems] = useState<Record<number, ZoteroItem[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null)
  const [narrations, setNarrations] = useState<Map<string, { jobId: string; title: string }>>(new Map())
  // Papers OpenAlex resolved citation data for -> "mappable". Filled by the prefetch.
  const [mapped, setMapped] = useState<Set<string>>(new Set())
  const [prefetchDone, setPrefetchDone] = useState(false)
  const [prefetchMsg, setPrefetchMsg] = useState<string | null>(null)
  const [selectedOpen, setSelectedOpen] = useState(false)
  const [titleByKey, setTitleByKey] = useState<Map<string, string>>(new Map())

  // Fetch references + citers for the whole (DOI-bearing) library so any selection maps
  // instantly. Papers un-grey as they resolve; runs once per load (guarded), cheap on re-run
  // (the backend skips already-cached items).
  const prefetchRunning = useRef(false)
  const runPrefetch = useCallback(async () => {
    if (prefetchRunning.current) return
    prefetchRunning.current = true
    setPrefetchDone(false)
    try {
      const { jobId, count } = await startLibraryPrefetch()
      if (count) {
        await pollJob(jobId, getGraphFetch, {
          intervalMs: 1200,
          onProgress: (job) => {
            setPrefetchMsg(job.detail || "Fetching citations...")
            // Refresh the mappable set so papers un-grey as their citations land.
            void mappedKeys().then((m) => setMapped(new Set(m.keys))).catch(() => {})
          },
          onDone: () => {},
          onError: () => setPrefetchMsg(null),
        })
      }
      const m = await mappedKeys()
      setMapped(new Set(m.keys))
    } catch {
      /* keep whatever mapped set we already have */
    } finally {
      setPrefetchMsg(null)
      setPrefetchDone(true)
      prefetchRunning.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cols, narr, corpus, maps] = await Promise.all([
        fetchZoteroCollections(),
        listNarrations(),
        listPapers(),
        mappedKeys(),
      ])
      setCollections(cols.collections)
      setLiveConnected(cols.liveConnected !== false)
      setLibraryMissing(cols.libraryMissing === true)
      setMountPath(cols.mountPath ?? null)
      setNarrations(new Map(narr.items.map((n) => [n.docId, { jobId: n.jobId, title: n.title }])))
      setMapped(new Set(maps.keys))
      setTitleByKey((prev) => {
        const next = new Map(prev)
        corpus.papers.forEach((p) => next.set(p.docId, p.title))
        return next
      })
      if (cols.libraryMissing !== true && cols.liveConnected !== false) void runPrefetch()
    } catch {
      setError("Couldn't load your Zotero library. Is the mount set?")
    } finally {
      setLoading(false)
    }
  }, [runPrefetch])

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
        setReconcileMsg(`Removed ${r.pruned} ${r.pruned === 1 ? "paper" : "papers"} no longer in your library.`)
        await load()
      }
    } catch (e) {
      setReconcileMsg(e instanceof Error ? e.message : "Cleanup failed.")
    } finally {
      setReconciling(false)
    }
  }, [load])

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
        if (next.has(col.collectionID)) next.delete(col.collectionID)
        else next.add(col.collectionID)
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
      } catch {
        setError("Couldn't resolve that collection.")
      }
    },
    [selectedKeys, setMany],
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
          <SidebarMenuButton className="grid h-7 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_2.5rem] pr-4" onClick={() => selectCollection(col)} title="Select this collection">
            <span className="truncate">{col.name}</span>
            {typeof col.itemCount === "number" && col.itemCount > 0 ? (
              <span className="text-right text-xs tabular-nums text-muted-foreground">{col.itemCount}</span>
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
                // Mappable = has citation data. No DOI is unmappable immediately; a DOI'd paper
                // is "pending" until the prefetch resolves it, then unmappable if still absent.
                const unmappable = !item.doi || (prefetchDone && !mapped.has(item.itemKey))
                const narration = narrations.get(item.itemKey)
                const reason = !item.doi
                  ? "No DOI - not on the map"
                  : unmappable
                    ? "No citation data found - not on the map"
                    : (item.title ?? item.itemKey)
                return (
                  <div
                    key={item.itemKey}
                    className={`flex min-w-0 items-center gap-2 rounded-md py-1.5 pr-4 text-sm hover:bg-sidebar-accent ${unmappable ? "opacity-60" : ""}`}
                    style={pad(26)}
                    title={reason}
                  >
                    <Checkbox checked={isSel} onCheckedChange={() => toggle(item.itemKey)} />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => toggle(item.itemKey)}
                    >
                      {item.title ?? item.itemKey}
                      {item.year ? <span className="ml-1 text-muted-foreground">{item.year}</span> : null}
                    </button>
                    <div className="flex w-7 shrink-0 items-center justify-center">
                      {narration ? (
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
                                  setMode("narrate")
                                  setActiveArtifact({
                                    kind: "narration",
                                    docId: item.itemKey,
                                    jobId: narration.jobId,
                                    title: narration.title || item.title || "",
                                  })
                                }}
                              >
                                <Play />
                              </Button>
                            }
                          />
                          <TooltipContent>Play narration</TooltipContent>
                        </Tooltip>
                      ) : null}
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

        {prefetchMsg ? (
          <div className="flex items-center gap-1.5 border-b py-2 text-xs text-muted-foreground" style={SIDEBAR_GUTTER}>
            <Loader2 className="size-3 shrink-0 animate-spin" />
            <span className="truncate">{prefetchMsg}</span>
          </div>
        ) : null}

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
            Your selection will not be saved across reloads - browser storage is blocked.
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
