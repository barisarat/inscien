"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { Check, ChevronRight, Download, Info, Loader2, Play, RefreshCw, X } from "lucide-react"

import {
  activeFetch,
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  fetchZoteroItems,
  getGraphFetch,
  listNarrations,
  listPapers,
  mappedKeys,
  prefetchStatus,
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
const SIDEBAR_TREE_INSET = 0

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
  // Papers OpenAlex resolved citation data for -> "mappable". Filled by the citation fetch.
  const [mapped, setMapped] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(0) // DOI-bearing papers still needing a fetch
  const [fetchedAll, setFetchedAll] = useState(false) // a whole-library fetch has completed
  const [fetching, setFetching] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [prefetchPct, setPrefetchPct] = useState(0)
  const [prefetchMsg, setPrefetchMsg] = useState<string | null>(null)
  const [selectedOpen, setSelectedOpen] = useState(false)
  const [titleByKey, setTitleByKey] = useState<Map<string, string>>(new Map())

  // Fetch references + citers for the whole (DOI-bearing) library so any selection maps
  // instantly. Papers un-grey as they resolve; runs once per load (guarded), cheap on re-run
  // (the backend skips already-cached items).
  const prefetchRunning = useRef(false)

  // Poll a (new or already-running) whole-library fetch to completion, un-greying papers as they
  // resolve so the map can use them immediately.
  const attachToJob = useCallback(async (jobId: string) => {
    setConfirming(false)
    setFetching(true)
    setPrefetchPct(0)
    setPrefetchMsg("Fetching citations...")
    try {
      await pollJob(jobId, getGraphFetch, {
        intervalMs: 1200,
        onProgress: (job) => {
          setPrefetchPct(job.progress ?? 0)
          setPrefetchMsg(job.detail || "Fetching citations...")
          void mappedKeys().then((m) => setMapped(new Set(m.keys))).catch(() => {})
        },
        onDone: () => {},
        onError: () => setPrefetchMsg(null),
      })
      const [m, s] = await Promise.all([mappedKeys(), prefetchStatus().catch(() => ({ pending: 0, total: 0 }))])
      setMapped(new Set(m.keys))
      setPending(s.pending)
    } catch {
      /* keep whatever mapped set we already have */
    } finally {
      setFetchedAll(true)
      setFetching(false)
      setPrefetchMsg(null)
      prefetchRunning.current = false
    }
  }, [])

  const runPrefetch = useCallback(async () => {
    if (prefetchRunning.current) return
    prefetchRunning.current = true
    try {
      const { jobId } = await startLibraryPrefetch() // idempotent - returns the running job if any
      await attachToJob(jobId)
    } catch {
      prefetchRunning.current = false
      setFetching(false)
      setConfirming(false)
    }
  }, [attachToJob])

  // If a whole-library fetch is already running (e.g. started before a reload, or still going from
  // an earlier session), resume its progress instead of looking idle / queuing a duplicate.
  const resumeIfFetching = useCallback(async () => {
    if (prefetchRunning.current) return
    try {
      const { jobId } = await activeFetch()
      if (jobId) {
        prefetchRunning.current = true
        void attachToJob(jobId)
      }
    } catch {
      /* ignore - just won't resume */
    }
  }, [attachToJob])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cols, narr, corpus, maps, pstat] = await Promise.all([
        fetchZoteroCollections(),
        listNarrations(),
        listPapers(),
        mappedKeys(),
        prefetchStatus().catch(() => ({ pending: 0, total: 0 })),
      ])
      setCollections(cols.collections)
      setLiveConnected(cols.liveConnected !== false)
      setLibraryMissing(cols.libraryMissing === true)
      setMountPath(cols.mountPath ?? null)
      setNarrations(new Map(narr.items.map((n) => [n.docId, { jobId: n.jobId, title: n.title }])))
      setMapped(new Set(maps.keys))
      setPending(pstat.pending)
      setTitleByKey((prev) => {
        const next = new Map(prev)
        corpus.papers.forEach((p) => next.set(p.docId, p.title))
        return next
      })
      void resumeIfFetching()
    } catch {
      setError("Couldn't load your Zotero library. Is the mount set?")
    } finally {
      setLoading(false)
    }
  }, [resumeIfFetching])

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
    const pad = (n: number) => ({ paddingLeft: n + SIDEBAR_TREE_INSET + depth * 12 })
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
                const isMapped = mapped.has(item.itemKey)
                // A DOI'd paper still being fetched spins; with no DOI (or after a completed
                // fetch that found nothing) it greys, like books did.
                const spinning = fetching && !!item.doi && !isMapped
                const unmappable = !item.doi || (fetchedAll && !isMapped)
                const narration = narrations.get(item.itemKey)
                const reason = !item.doi
                  ? "No DOI - not on the map"
                  : spinning
                    ? "Fetching citations..."
                    : unmappable
                      ? "No references in OpenAlex - not on the References map"
                      : (item.title ?? item.itemKey)
                return (
                  <div
                    key={item.itemKey}
                    className={`flex min-w-0 items-center gap-2 rounded-md py-1.5 pr-4 text-sm hover:bg-sidebar-accent ${unmappable ? "opacity-60" : ""}`}
                    style={pad(26)}
                    title={item.title ?? item.itemKey}
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
                    <div className="flex shrink-0 items-center gap-0.5">
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
                      ) : (
                        <span className="h-6 w-7" aria-hidden />
                      )}
                      {spinning ? (
                        <span className="flex h-6 w-7 items-center justify-center" title="Fetching citations...">
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        </span>
                      ) : isMapped ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                aria-label="Citations ready"
                                role="img"
                                className="flex h-6 w-7 items-center justify-center text-muted-foreground"
                              >
                                <Check className="size-3.5" />
                              </span>
                            }
                          />
                          <TooltipContent>Citations ready - on the map</TooltipContent>
                        </Tooltip>
                      ) : unmappable ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                aria-label={reason}
                                role="img"
                                className="flex h-6 w-7 items-center justify-center text-muted-foreground/50"
                              >
                                <Info className="size-3.5" />
                              </span>
                            }
                          />
                          <TooltipContent>{reason}</TooltipContent>
                        </Tooltip>
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

        {fetching ? (
          <div className="border-b" style={SIDEBAR_GUTTER}>
            <div className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 shrink-0 animate-spin" />
              <span className="truncate">{prefetchMsg || "Fetching citations..."}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.max(3, prefetchPct)}%` }} />
            </div>
            <div className="h-3" aria-hidden />
          </div>
        ) : confirming ? (
          <div className="border-b text-xs" style={SIDEBAR_GUTTER}>
            <div className="flex min-h-12 items-center leading-4 text-muted-foreground">
              Fetch citations for {pending} {pending === 1 ? "paper" : "papers"}? Each paper&apos;s DOI is sent to OpenAlex.
            </div>
            <div className="flex h-11 items-start gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 min-w-16 rounded-[min(var(--radius-md),12px)] border-border/70 bg-card !px-4 text-[0.8rem] hover:border-border hover:bg-muted"
                onClick={() => void runPrefetch()}
              >
                Fetch
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 min-w-16 rounded-[min(var(--radius-md),12px)] border-border/70 bg-card !px-4 text-[0.8rem] hover:border-border hover:bg-muted"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : pending > 0 ? (
          <div className="flex h-13 items-center border-b" style={SIDEBAR_GUTTER}>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-fit justify-start gap-2 rounded-[min(var(--radius-md),12px)] border-border/70 bg-card !px-4 text-[0.8rem] hover:border-border hover:bg-muted"
              onClick={() => setConfirming(true)}
            >
              <Download className="size-3.5 shrink-0" /> Fetch citations · {pending} {pending === 1 ? "paper" : "papers"}
            </Button>
          </div>
        ) : null}

        {!loading && !error && libraryMissing ? (
          <div className="flex min-h-12 items-center text-xs leading-4 text-muted-foreground" style={SIDEBAR_GUTTER}>
            No Zotero library found{mountPath ? <> at <code>{mountPath}</code></> : null}. Set{" "}
            <code>ZOTERO_HOST_DIR</code> to your Zotero data directory and restart the stack - see the README.
          </div>
        ) : null}
        {!loading && !error && !liveConnected && !libraryMissing ? (
          <div className="flex min-h-12 items-center text-xs leading-4 text-muted-foreground" style={SIDEBAR_GUTTER}>
            Live Zotero library not connected - showing the last snapshot.
          </div>
        ) : null}
        {persistError ? (
          <div className="flex min-h-12 items-center text-xs leading-4 text-muted-foreground" style={SIDEBAR_GUTTER}>
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
