"use client"

import { useCallback, useEffect, useState, type PointerEvent } from "react"
import { Check, ChevronRight, Info, Loader2, Play, RefreshCw, X } from "lucide-react"

import {
  fetchZoteroCollections,
  fetchZoteroItems,
  listNarrations,
  listPapers,
  mappedKeys,
  reconcileZotero,
  type ZoteroCollection,
  type ZoteroItem,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
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
  // Papers OpenAlex resolved citation data for -> "mappable" (a check in the tree). Filled from the
  // cache on load; a selection's citations are fetched lazily by the Map when you view it, so we
  // never bulk-fetch the whole library or a whole collection (that hits OpenAlex rate limits).
  const [mapped, setMapped] = useState<Set<string>>(new Set())
  const [selectedOpen, setSelectedOpen] = useState(false)
  const [titleByKey, setTitleByKey] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Drop cached per-collection items so a removed paper/collection actually disappears
    // (and new ones appear) on reload; expanded collections re-fetch via the effect below.
    setItems({})
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
    } catch {
      setError("Couldn't load your Zotero library. Is the mount set?")
    } finally {
      setLoading(false)
    }
  }, [])

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
      }
      // Always re-read the library so removed collections/papers disappear from the tree,
      // not just when cached citation data happened to be pruned.
      await load()
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

  // After a reload clears the items cache, re-fetch any still-expanded collections so their
  // rows refresh in place (removed papers vanish, new ones appear) without re-expanding.
  useEffect(() => {
    for (const id of expanded) {
      if (!items[id]) void loadItems(id)
    }
  }, [expanded, items, loadItems])

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
          <SidebarMenuButton
            className="grid h-7 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_2.5rem] pr-4"
            onClick={() => toggleExpand(col)}
            title={isOpen ? "Collapse collection" : "Expand collection"}
          >
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
                // A paper with no DOI can't be mapped; one with a DOI shows a check once its
                // citations are cached (fetched lazily when you view it on the Map).
                const unmappable = !item.doi
                const narration = narrations.get(item.itemKey)
                const reason = !item.doi
                  ? "No DOI - not on the map"
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
                      {isMapped ? (
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

        {!loading && !error && libraryMissing ? (
          <div className="flex min-h-12 items-center text-xs leading-4 text-muted-foreground" style={SIDEBAR_GUTTER}>
            No Zotero library found{mountPath ? <> at <code>{mountPath}</code></> : null}. Set your
            Zotero data directory in Settings.
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
