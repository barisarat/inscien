"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { AudioLines, ChevronRight, Clock, Download, Hash, Headphones, Info, Loader2, RefreshCw, X } from "lucide-react"

import {
  fetchZoteroCollections,
  fetchZoteroItems,
  listLibraryPapers,
  type LibraryPaper,
  type ZoteroCollection,
  type ZoteroItem,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { usePersisted } from "@/lib/usePersisted"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Toggle } from "@/components/ui/toggle"
import { startBuild, startNarrate, useJob } from "@/lib/job"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// The tree's open collections and its scroll position survive a reload and a return from a
// reader tab (2026-09-03): they are per-browser conveniences, so localStorage, read once at
// mount and written on every change. Both reads tolerate a missing or unreadable store.
const EXPANDED_KEY = "inscien.sidebarExpanded"
const SCROLL_KEY = "inscien.sidebarScroll"
const readExpanded = (): Set<number> => {
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY)
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? ids.filter((n): n is number => typeof n === "number") : [])
  } catch {
    return new Set()
  }
}

// Every row is one grid: a title track that may shrink to nothing, then three fixed tracks for
// the label (a collection's built/total; papers carry none) and two action slots. The slots are
// always rendered, an empty one being a blank box, so the icons form a column down the sidebar
// whatever a given row happens to carry.
//
// Declared tracks rather than an absolutely positioned action box (2026-09-10, second attempt):
// the absolute version has to be measured against the right ancestor and depends on the row's
// button shrinking on its own. It did neither - the collection's actions centred themselves over
// the whole expanded subtree, and long titles ran out under the icons and past the sidebar.
// minmax(0,1fr) cannot be talked out of its width by its contents, which is the entire point.
// Two grids, one right edge (2026-09-14). The count track is a COLLECTION's track: once the
// per-paper percent became the icon colour, a paper row carrying it reserved 2.25rem of nothing
// and its title truncated that much early. The paper grid drops the track, so the title runs on
// and the icons stay in the same two columns - both grids end at the same x, so counts and icons
// still read as one column down the sidebar.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_2.25rem_1.5rem_1.5rem] items-center gap-1"
// The pr matches the gutter the icons already keep between themselves (2026-09-16), so the last
// icon is not tighter against the sidebar edge than it is against its neighbour.
const ITEM_GRID = "grid grid-cols-[minmax(0,1fr)_1.5rem_1.5rem] items-center gap-1 pr-1.5"
// What the button must pad past to keep its text off the cells: the fixed tracks plus their gaps.
const ROW_PAD = "pr-24"
const ITEM_PAD = "pr-14"
// A BUILT paper has nothing in the first slot (see renderBuild), so its title may run on under
// that empty cell - the icons keep their tracks, so the second column still lines up whether or
// not the row above it carries a stage action.
const ITEM_PAD_SOLO = "pr-8"

// The button spans every track and the cells sit on top of it, so the whole row still hovers and
// clicks as one while the icons keep their own columns.
//
// Every cell is relative + z-10, and that is load-bearing: SidebarMenuSubButton carries a
// -translate-x-px, a transform makes it a stacking context painted in the positioned layer, and
// it therefore paints OVER later in-flow siblings. At rest its background is transparent so the
// icons showed through; on hover the row background swallowed them whole (2026-09-10).
function RowActions({ label, first, second }: { label?: string; first: ReactNode; second: ReactNode }) {
  // undefined label means THIS GRID HAS NO COUNT TRACK (a paper row), so the icons take the two
  // tracks that follow the title. An empty string is a collection with its counts hidden: the
  // track stays, and so does the column the icons sit in.
  const iconCol = label === undefined ? ["col-start-2", "col-start-3"] : ["col-start-3", "col-start-4"]
  return (
    <>
      {label === undefined ? null : (
        <span className="relative z-10 col-start-2 row-start-1 text-right text-xs tabular-nums text-muted-foreground">{label}</span>
      )}
      <span className={`relative z-10 ${iconCol[0]} row-start-1 flex size-6 items-center justify-center`}>{first}</span>
      <span className={`relative z-10 ${iconCol[1]} row-start-1 flex size-6 items-center justify-center`}>{second}</span>
    </>
  )
}

// Defined at module scope on purpose: a component declared inside the navigator would be a new
// type on every render, and React would remount every checkbox in the tree each time.

type Props = {
  onResizeStart?: (event: PointerEvent<HTMLButtonElement>) => void
}

// The library sidebar is the Zotero collection tree, read live from the snapshot, so a paper
// sits under the shelf it has in Zotero and moving it there moves it here. What is NOT Zotero's
// is whether a paper is on the map: only a BUILT paper (its PDF read, its reference list
// extracted into library/) has a checkbox. Everything else is listed so the shelf reads whole,
// and a row with a PDF carries two actions: build (read its references for the map) and
// narrate. Each runs as the one background job, shown in the job pane.
export default function LibraryNavigator({ onResizeStart }: Props) {
  const { selectedKeys, toggle, setMany, clear, persistError } = useZoteroSelection()
  // How you like to read the tree, not anything about the library - so it lives on the device.
  const [showCounts, setShowCounts] = usePersisted("inscien-sidebar-counts", true)

  const [collections, setCollections] = useState<ZoteroCollection[]>([])
  const [libraryMissing, setLibraryMissing] = useState(false)
  const [mountPath, setMountPath] = useState<string | null>(null)
  const [items, setItems] = useState<Record<number, ZoteroItem[]>>({})
  const [expanded, setExpanded] = useState<Set<number>>(() => (typeof window === "undefined" ? new Set() : readExpanded()))
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollRestored = useRef(false)
  const [papers, setPapers] = useState<Map<string, LibraryPaper>>(new Map())
  const [staging, setStaging] = useState<Set<string>>(new Set())
  const [queueing, setQueueing] = useState<Set<string>>(new Set())
  // The one background job (build or narrate). While it runs, every start action is disabled;
  // when it finishes, the tree is re-read so the row shows what the job produced.
  const job = useJob()
  const jobRunning = job?.status === "running"
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setItems({})
    try {
      const [cols, lib] = await Promise.all([fetchZoteroCollections(), listLibraryPapers()])
      setCollections(cols.collections)
      setLibraryMissing(cols.libraryMissing === true)
      setMountPath(cols.mountPath ?? null)
      setPapers(new Map((lib.papers || []).map((p) => [p.slug, p])))
    } catch {
      setError("Couldn't read the library.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadItems = useCallback(
    async (collectionId: number) => {
      if (items[collectionId]) return
      try {
        const r = await fetchZoteroItems(collectionId)
        setItems((prev) => ({ ...prev, [collectionId]: r.items }))
      } catch {
        setItems((prev) => ({ ...prev, [collectionId]: [] }))
      }
    },
    [items],
  )

  // After a reload clears the items cache, re-fetch the still-expanded collections in place.
  useEffect(() => {
    for (const id of expanded) {
      if (!items[id]) void loadItems(id)
    }
  }, [expanded, items, loadItems])

  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      /* a blocked store only costs the convenience */
    }
  }, [expanded])

  // Restore the scroll position once, when every open collection has its rows, so the tree has
  // its final height; before that the saved offset would be clamped to a shorter list.
  useEffect(() => {
    if (scrollRestored.current || loading || !contentRef.current) return
    if ([...expanded].some((id) => !items[id])) return
    scrollRestored.current = true
    try {
      const top = Number(window.localStorage.getItem(SCROLL_KEY) || 0)
      if (top > 0) contentRef.current.scrollTop = top
    } catch {
      /* same */
    }
  }, [loading, expanded, items])

  const rememberScroll = useCallback(() => {
    const el = contentRef.current
    if (!el || !scrollRestored.current) return
    try {
      window.localStorage.setItem(SCROLL_KEY, String(Math.round(el.scrollTop)))
    } catch {
      /* same */
    }
  }, [])

  // Drop selected slugs that are no longer in the library, so a stale sessionStorage selection
  // cannot silently scope the map to papers that do not exist.
  useEffect(() => {
    if (loading || error || papers.size === 0) return
    const dead = [...selectedKeys].filter((k) => !papers.has(k))
    if (dead.length) setMany(dead, false)
  }, [papers, loading, error, selectedKeys, setMany])

  // Any click on the tree - a collection, a paper - is a request for the Map: it closes an
  // open narration (2026-09-03), which is the only way back besides the paper's own headphones.
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

  // Build: stage the PDF and run the build as the background job.
  const stage = useCallback(async (item: ZoteroItem) => {
    setStaging((prev) => new Set(prev).add(item.itemKey))
    await startBuild(item.itemKey)
    setStaging((prev) => {
      const next = new Set(prev)
      next.delete(item.itemKey)
      return next
    })
  }, [])

  // Narrate: copy the PDF into the narration queue and run the narration as the background job.
  const narrate = useCallback(async (item: ZoteroItem) => {
    setQueueing((prev) => new Set(prev).add(item.itemKey))
    await startNarrate(item.itemKey)
    setQueueing((prev) => {
      const next = new Set(prev)
      next.delete(item.itemKey)
      return next
    })
  }, [])

  // Re-read the tree when a job finishes, so the row shows its new state.
  const lastJobStatus = useRef<string | null>(null)
  useEffect(() => {
    if (lastJobStatus.current === "running" && job?.status === "done") void load()
    lastJobStatus.current = job?.status ?? null
  }, [job?.status, load])

  // The narration slot. Ready is a link to the reader; queued is a clock that starts the
  // narration; otherwise the narrate action, and nothing at all for a paper with no PDF. Every
  // branch is exactly one 24px control, because this is a column - see RowActions.
  const renderNarration = (item: ZoteroItem) => {
    const n = item.narration
    if (n?.status === "ready" && n.url) {
      const url = n.url
      // No figure lives in this button and none lives beside it either: a label inside would
      // widen the button and push the icon out of line (2026-09-10), and the separate percent
      // column that replaced it is gone too - see the tone below. The exact figure stays in the
      // tooltip, which is where a number you might actually want belongs.
      const started = !n.finished && (n.percent ?? 0) > 0
      const label = n.finished ? "Listened - open again" : started ? `Listened to ${n.percent} percent - continue` : "Listen"
      // Progress is the icon's COLOUR, not a printed figure (2026-09-14). A percent per row is
      // three characters of precision nobody acts on, and it only appeared on rows that had
      // one, so the column was ragged. Three states are all a shelf needs to read at a glance:
      // done, part-way, untouched - green, amber, plain.
      const tone = n.finished || (n.percent ?? 0) >= 95
        ? "text-emerald-600 dark:text-emerald-500"
        : (n.percent ?? 0) >= 10
          ? "text-amber-600 dark:text-amber-500"
          : "text-foreground"
      // No tooltip on this one (2026-09-14): the colour already says how far in you are, and a
      // hover card over every row of a long shelf is noise. The same sentence stays as the
      // aria-label, so nothing is lost to a screen reader.
      return (
        <Button
          variant="ghost"
          size="icon-xs"
          className={`size-6 ${tone}`}
          aria-label={label}
          render={<Link href={url} />}
        >
          <Headphones className="size-3.5" />
        </Button>
      )
    }
    if (n?.status === "queued") {
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6"
                aria-label="Queued for narration - narrate it now"
                disabled={jobRunning}
                onClick={() => void narrate(item)}
              >
                <Clock className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>{jobRunning ? "A job is running - wait for it to finish" : "Queued - click to narrate it now"}</TooltipContent>
        </Tooltip>
      )
    }
    if (!item.hasPdf) return null
    const busy = queueing.has(item.itemKey)
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6"
              aria-label="Narrate"
              disabled={busy || jobRunning}
              onClick={() => void narrate(item)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
            </Button>
          }
        />
        <TooltipContent>{jobRunning ? "A job is running - wait for it to finish" : "Narrate this paper"}</TooltipContent>
      </Tooltip>
    )
  }

  // The build slot: a clock once the PDF is staged, the stage action while it is not, and a
  // quiet marker for a paper Zotero has no PDF for. A built paper has nothing to do here.
  const renderBuild = (item: ZoteroItem) => {
    if (item.status === "built") return null
    if (item.status === "staged") {
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-6"
                aria-label="Staged - build it now"
                disabled={jobRunning}
                onClick={() => void stage(item)}
              >
                <Clock className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>{jobRunning ? "A job is running - wait for it to finish" : "Staged - click to build it now"}</TooltipContent>
        </Tooltip>
      )
    }
    if (!item.hasPdf) {
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <span role="img" aria-label="No PDF" className="flex size-6 items-center justify-center opacity-50">
                <Info className="size-3.5" />
              </span>
            }
          />
          <TooltipContent>No PDF in Zotero - nothing to build from</TooltipContent>
        </Tooltip>
      )
    }
    const busy = staging.has(item.itemKey)
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6"
              aria-label="Build for the map"
              disabled={busy || jobRunning}
              onClick={() => void stage(item)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            </Button>
          }
        />
        <TooltipContent>{jobRunning ? "A job is running - wait for it to finish" : "Build this paper for the map"}</TooltipContent>
      </Tooltip>
    )
  }

  // Re-narrating a paper that already has a bundle is NOT offered here: the shelf is for getting
  // to a narration. That action lives on the listen page.

  const renderItem = (item: ZoteroItem) => {
    const title = item.title ?? item.itemKey
    const built = item.status === "built" && item.slug
    const slug = item.slug
    const checked = Boolean(slug && selectedKeys.has(slug))
    const stage = renderBuild(item)
    return (
      <SidebarMenuSubItem key={item.itemKey} className={`relative ${ITEM_GRID}`}>
        {/* The checkbox sits over the row rather than inside its button: a checkbox nested in a
            button is two controls in one hit target. Both row kinds pad past it by the same
            amount, so built and unbuilt titles start at the same x. */}
        {built && slug ? (
          <Checkbox
            className="absolute top-1/2 left-1.5 z-10 -translate-y-1/2"
            checked={checked}
            onCheckedChange={() => toggle(slug)}
            aria-label={title}
          />
        ) : null}
        <SidebarMenuSubButton
          size="sm"
          isActive={checked}
          className={`col-span-3 col-start-1 row-start-1 w-full ${stage ? ITEM_PAD : ITEM_PAD_SOLO} pl-7` + (built ? " cursor-pointer" : " text-muted-foreground")}
          render={built && slug ? <button type="button" onClick={() => toggle(slug)} /> : <span />}
        >
          <Tooltip>
            <TooltipTrigger render={<span className="block min-w-0 flex-1 truncate text-left">{title}</span>} />
            {/* The full title: the row truncates it, and that is the only thing a hover here
                needs to answer. */}
            <TooltipContent>{title}</TooltipContent>
          </Tooltip>
        </SidebarMenuSubButton>
        <RowActions
          first={stage}
          second={renderNarration(item)}
        />
      </SidebarMenuSubItem>
    )
  }

  // A row that stands in for the papers of a collection still being read, or for one with
  // none. Same height and same indent as the rows it replaces, so the tree does not jump.
  const placeholderRow = (key: string, children: ReactNode) => (
    <SidebarMenuSubItem key={key}>
      <span className="flex h-7 items-center gap-1.5 pl-7 text-xs text-muted-foreground">{children}</span>
    </SidebarMenuSubItem>
  )

  const renderCollection = (col: ZoteroCollection) => {
    const isOpen = expanded.has(col.collectionID)
    const rows = items[col.collectionID]
    // Still read from the backend's recursive builtSlugs, now only to count what is built.
    const built = col.builtSlugs ?? []
    const count = typeof col.itemCount === "number" ? col.itemCount : 0
    // The guide line marks where the tree BRANCHES. A shelf holding other shelves keeps the
    // stock rule; a plain list of papers reads better as a list, so it loses it.
    const branches = col.children.length > 0
    return (
      <SidebarMenuItem key={col.collectionID}>
        {/* The header row owns the positioning context, NOT the <li>: the li also holds the
            expanded subtree, so actions measured against it centre over the children. */}
        <div className={ROW_GRID}>
        <SidebarMenuButton
          className={`col-span-4 col-start-1 row-start-1 w-full ${ROW_PAD}`}
          onClick={() => toggleExpand(col)}
        >
          <ChevronRight className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1 truncate text-left">{col.name}</span>
        </SidebarMenuButton>
        {/* A collection reports what it holds and nothing else. Selection is a paper's own
            checkbox, on the left, at one level: a select-all here put a checkbox in the column
            that means "listen" on every row below it, so one column meant two things and
            selection appeared on both sides of the row (2026-09-10). */}
        <RowActions label={showCounts && count > 0 ? `${built.length}/${count}` : ""} first={null} second={null} />
        </div>

        {/* Nesting is the indent: a collection's children live in its own sub-list, so no row
            computes a depth. The right inset is removed at every level (mr-0 pr-0): the stock
            sub-list insets BOTH sides, so each nesting level pulled the row right edge in by
            1.5rem and the count, percent and icon columns stepped left with depth. Only the
            left inset is the indent, so the numbers line up in one column at every depth. */}
        {isOpen ? (
          <SidebarMenuSub className={`mr-0 pr-0 ${branches ? "" : "border-transparent"}`}>
            {col.children.map((child) => renderCollection(child))}
            {rows === undefined
              ? placeholderRow(`loading-${col.collectionID}`, <><Loader2 className="size-3 animate-spin" /> Loading...</>)
              : rows.length === 0 && col.children.length === 0
                ? placeholderRow(`empty-${col.collectionID}`, "Empty")
                : rows.map((item) => renderItem(item))}
          </SidebarMenuSub>
        ) : null}
      </SidebarMenuItem>
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

      <SidebarHeader className="h-13 justify-center border-b px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Library</span>
          <div className="flex items-center gap-1">
            {/* Re-read the library and the narration state in place: a bundle that finished
                building in paper tts, or a PDF queued from another tab, shows up without a
                page reload. load() refetches the expanded collections after clearing them. */}
            <Button variant="ghost" size="icon-xs" aria-label="Refresh library" disabled={loading} onClick={() => void load()}>
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
            <SidebarTrigger />
          </div>
        </div>
      </SidebarHeader>

      {/* The tree's control strip: fixed under the header, OUTSIDE the scroller, so it stays
          put while the tree moves. Always present - a bar that appears and disappears with a
          selection shifts every row under it by its own height. View switches live here; the
          selection count joins them when there is one. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-4">
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                variant="segment"
                size="sm"
                pressed={showCounts}
                onPressedChange={setShowCounts}
                aria-label="Show how many papers are built"
              />
            }
          >
            <Hash />
          </TooltipTrigger>
          <TooltipContent>{showCounts ? "Hide" : "Show"} the built/total counts</TooltipContent>
        </Tooltip>
        <span className="flex-1" />
        {selectedKeys.size > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">{selectedKeys.size} selected</span>
            <Button variant="ghost" size="icon-xs" aria-label="Clear selection" onClick={clear}>
              <X />
            </Button>
          </>
        ) : null}
      </div>

      <SidebarContent className="gap-0" ref={contentRef} onScroll={rememberScroll}>
        {persistError ? (
          <div className="flex min-h-12 items-center px-4 text-xs leading-4 text-muted-foreground">
            Your selection will not be saved across reloads - browser storage is blocked.
          </div>
        ) : null}

        <SidebarGroup className="px-2 py-2">
          {loading ? (
            <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Loading library...
            </div>
          ) : error ? (
            <div className="mx-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : libraryMissing ? (
            <div className="px-2 text-xs leading-4 text-muted-foreground">
              No Zotero library found{mountPath ? <> at <code>{mountPath}</code></> : null}.
            </div>
          ) : collections.length === 0 ? (
            <div className="px-2 text-xs text-muted-foreground">No collections found.</div>
          ) : (
            <SidebarMenu>{collections.map((col) => renderCollection(col))}</SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
