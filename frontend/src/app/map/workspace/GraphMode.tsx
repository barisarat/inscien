"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { fetchLibraryGraph, type LibraryGraph } from "@/lib/api"
// The selection provider still carries its Zotero-era name; it now holds library slugs.
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import GraphView, { CITATION_TIERS, type AtlasEdge, type AtlasNode } from "../components/GraphView"
import NodeInspector from "../components/NodeInspector"
import ModeBar from "@/components/navigation/ModeBar"
import SidebarAwayTrigger from "./SidebarAwayTrigger"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const percentile = (values: number[], p: number) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

// One figure in the bar: the number over its own caption, not a dash-joined sentence. The row
// was eight bare counts joined by dashes and the words alone had to carry what each one meant
// (2026-09-14) - "350 on the map", "46 shared", "40 unresolved" say nothing about which whole
// they are part of. Captioned, it reads as a strip of measures.
//
// Five figures, and every one of them describes THE MAP (2026-09-14). Three were dropped rather
// than renamed. "merged" and "internal" reconciled the extraction - references = distinct works
// + merged + internal - which is a build concern, and "merged" counted extra ENTRIES, so it read
// as a count of works and was not one. "unknown to the API" was the weakest of the three: it is
// our reference count minus OpenAlex's referenced_works_count for the citing paper, so it names
// no reference, fires hardest on papers whose bibliography OpenAlex simply never ingested
// (Bagaria: 0 on file, all 22 counted, all 22 resolved with citation counts), and cannot be
// acted on. All three survive where they belong: paper.json's checksum, printed per paper by
// tools/show.mjs.
//
// What is left answers what you can see: how many you picked, how many references they printed,
// how many distinct works those came to, how many of those several of your papers share, and how
// many we could not identify.
// All of it muted, numbers included (2026-09-14): this is a readout ABOUT the map, not part of
// it, and at full contrast a row of eight figures competes with the graph for the eye.
//
// No type treatment of its own: the stock text-sm/text-xs pair and the same proportional figures
// as every other number in the app. A tabular-figure variant here would have been a new style
// for one strip.
function Stat({ value, label, title }: { value: number; label: string; title?: string }) {
  return (
    <span className="flex shrink-0 flex-col items-center gap-0.5 text-muted-foreground" title={title}>
      <span className="text-sm leading-none">{value}</span>
      <span className="text-xs leading-none whitespace-nowrap">{label}</span>
    </span>
  )
}

export default function GraphMode() {
  const { selectedKeys } = useZoteroSelection()
  const { openPdf } = useWorkspace()
  // View controls. There is no layout switch any more: the time axis is tiered, so it no longer
  // costs the width that made a separate Network mode worth having.

  // Filters. Both are thresholds on REFERENCES only - your own papers are the selection and stay
  // on the map, because a filter should narrow what you are looking at, not silently unselect
  // what you picked in the sidebar.
  const [minYear, setMinYear] = useState<number | null>(null)
  const [minCitations, setMinCitations] = useState(0)
  const [minShared, setMinShared] = useState(1)

  const [graph, setGraph] = useState<LibraryGraph | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("empty")
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const slugs = useMemo(() => Array.from(selectedKeys).sort(), [selectedKeys])
  const slugsKey = slugs.join(",")

  useEffect(() => setSelectedId(null), [slugsKey])

  // One request, assembled from local artifacts. There is nothing to stream, nothing to queue and
  // nothing to cancel - which is the whole difference from fetching each paper's references over
  // the network. A stale response from a previous selection is dropped by the cancelled flag.
  useEffect(() => {
    if (slugs.length === 0) {
      setGraph(null)
      setPhase("empty")
      return
    }
    let cancelled = false
    setPhase("loading")
    setError(null)
    void fetchLibraryGraph(slugs)
      .then((g) => {
        if (cancelled) return
        setGraph(g)
        setPhase("ready")
      })
      .catch(() => {
        if (cancelled) return
        setError("Couldn't read the library.")
        setPhase("error")
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugsKey])

  // The years actually present, newest first. Offering a year nothing was published in would be
  // a filter step that changes nothing, which is exactly the emptiness the rank axis removed.
  const yearOptions = useMemo(() => {
    const years = (graph?.nodes ?? [])
      .filter((n) => n.type === "external")
      .map((n) => Number(n.year))
      .filter((y) => Number.isFinite(y) && y > 0)
    return [...new Set(years)].sort((p, q) => q - p)
  }, [graph])

  // How many of your papers cite a work, at most, over the current selection - the same number
  // the ring is drawn from. Offering "4+" when nothing is cited by four is the empty filter step
  // the year list already refuses to be.
  const sharedOptions = useMemo(() => {
    const top = Math.max(0, ...(graph?.nodes ?? [])
      .filter((n) => n.type === "external")
      .map((n) => n.citedBy ?? 0))
    return Array.from({ length: Math.max(0, top - 1) }, (_, i) => i + 2)
  }, [graph])

  // A new selection means new years; drop the thresholds rather than carrying a filter onto a
  // different set of papers where it might hide everything.
  useEffect(() => {
    setMinYear(null)
    setMinCitations(0)
    setMinShared(1)
  }, [slugsKey])

  // Map the library graph (your papers + everything they cite) into the renderer model, applying
  // the filters. Owned papers are never filtered out; an edge is kept only if both ends survive.
  const composed = useMemo<{ nodes: AtlasNode[]; edges: AtlasEdge[]; hidden: number }>(() => {
    if (!graph) return { nodes: [], edges: [], hidden: 0 }
    const keep = (n: (typeof graph.nodes)[number]) => {
      if (n.type === "owned") return true
      const year = Number(n.year)
      if (minYear != null && Number.isFinite(year) && year < minYear) return false
      if (minCitations > 0 && (n.globalCitedBy ?? 0) < minCitations) return false
      // citedBy is the within-selection degree, so this is the overlap filter: show me only what
      // several of my papers cite. Distinct from the Cited filter beside it, which is the world's
      // citation count for the work.
      if (minShared > 1 && (n.citedBy ?? 0) < minShared) return false
      return true
    }
    const kept = graph.nodes.filter(keep)
    const keptIds = new Set(kept.map((n) => n.id))
    const hidden = graph.nodes.length - kept.length
    const nodes: AtlasNode[] = kept.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      year: n.year,
      month: n.month,
      date: n.date,
      citedBy: n.citedBy,
      globalCitedBy: n.globalCitedBy,
      doi: n.doi,
      collection: n.collection ?? null,
      // The card's reference lines. This mapping is an explicit field list, so a field the
      // backend adds is invisible until it is named here - authors and venue arrived in the
      // payload and showed nothing for exactly that reason.
      authors: n.authors ?? [],
      venue: n.venue ?? null,
      narrationUrl: n.narrationUrl ?? null,
    }))
    const edges: AtlasEdge[] = graph.edges
      .filter((e) => keptIds.has(e.from) && keptIds.has(e.to))
      .map((e) => ({
        source: e.from,
        target: e.to,
        direct: true,
        external: true,
        overlay: "references",
      }))
    return { nodes, edges, hidden }
  }, [graph, minYear, minCitations, minShared])

  const ownedCount = useMemo(() => composed.nodes.filter((n) => n.type === "owned").length, [composed.nodes])
  const filtersActive = minYear != null || minCitations > 0 || minShared > 1
  const sharedCount = useMemo(
    () => composed.nodes.filter((n) => n.type === "external" && (n.citedBy ?? 0) > 1).length,
    [composed.nodes],
  )
  const referenceCount = composed.nodes.length - ownedCount
  const extracted = graph?.summary?.extracted ?? 0
  const unresolvedCount = graph?.summary?.unresolved ?? 0
  const selectedNode = useMemo(() => composed.nodes.find((n) => n.id === selectedId) ?? null, [composed.nodes, selectedId])

  if (phase === "empty") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ModeBar>
          <SidebarAwayTrigger />
        </ModeBar>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            Select processed papers in the library to see what they cite.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModeBar>
        <SidebarAwayTrigger />
        {yearOptions.length > 1 ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">From</span>
            <Select
              value={minYear == null ? "all" : String(minYear)}
              onValueChange={(v) => setMinYear(v === "all" ? null : Number(v))}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Cited</span>
          <Select
            value={String(minCitations)}
            onValueChange={(v) => setMinCitations(Number(v))}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any</SelectItem>
              {CITATION_TIERS.map((t) => (
                <SelectItem key={t} value={String(t)}>{t}+</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sharedOptions.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Shared by</span>
            <Select value={String(minShared)} onValueChange={(v) => setMinShared(Number(v))}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Any</SelectItem>
                {sharedOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}+ papers</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {filtersActive ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => { setMinYear(null); setMinCitations(0); setMinShared(1) }}
          >
            Reset
          </button>
        ) : null}

        {ownedCount > 0 ? (
          <>
            <span className="flex min-w-0 items-end gap-x-4">
              <Stat value={ownedCount} label="selected" />
              <Stat value={extracted > 0 ? extracted : referenceCount} label="references" />
              <Stat value={referenceCount} label="unique" />
              {sharedCount > 0 ? (
                <Stat value={sharedCount} label="cited multiple times" title="a work cited by more than one of the selected papers" />
              ) : null}
              {!filtersActive && unresolvedCount > 0 ? (
                <Stat value={unresolvedCount} label="unmatched" title="no confident match found; the node holds the raw reference string, with no metadata or citation count" />
              ) : null}
              {filtersActive && composed.hidden > 0 ? (
                <Stat value={composed.hidden} label="hidden by filters" />
              ) : null}
            </span>
          </>
        ) : null}
      </ModeBar>

      {phase === "loading" && ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="flex max-w-md items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading the library...
          </p>
        </div>
      ) : phase === "error" && ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        </div>
      ) : ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            {graph && graph.unmapped.length > 0
              ? "Those papers have not been processed yet - build them with tools/build.mjs."
              : "Nothing to map for this selection."}
          </p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            data={composed}
            layout="timeline"
            colorBy="type"
            showHulls={false}
            scaleByCitations
            emphasis={null}
            selectedId={selectedId}
            layoutKey="references"
            onSelectNode={(n) => setSelectedId(n.id)}
            onClearSelection={() => setSelectedId(null)}
          />
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onClose={() => setSelectedId(null)}
              onOpenPdf={(n) => openPdf({ sourceId: n.id, title: n.label, page: 1 })}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
