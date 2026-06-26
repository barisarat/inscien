"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  cancelGraphFetch,
  fetchCitingGraph,
  fetchDiscoveryGraph,
  getGraphFetch,
  startCitingFetch,
  startGraphFetch,
  type DiscoveryGraph,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob } from "./skillJob"
import GraphView, { type AtlasEdge, type AtlasNode, type GraphLayout } from "../components/GraphView"
import NodeInspector from "../components/NodeInspector"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"

// The two citation lenses: what your papers cite (References) and what cites them (Cited by).
type Lens = "cite" | "cited"

// A cached layer, tagged with the selection it was fetched for (so a selection change invalidates
// it cleanly) and whether every selected paper is in it (`complete` -> no more fetching needed).
type Cached = { keys: string; data: DiscoveryGraph; complete: boolean } | null

const DISCLOSURE =
  "Citation data is from OpenAlex (open scholarly data) - each paper's DOI fetches its public " +
  "references and citers."

function selectedKeysOverlapCache(cachedKeys: string, selected: string[]): boolean {
  if (!cachedKeys || selected.length === 0) return false
  const cachedSet = new Set(cachedKeys.split(","))
  return selected.some((key) => cachedSet.has(key))
}

function filterCachedGraphToSelection(data: DiscoveryGraph, selected: string[]): DiscoveryGraph {
  const selectedSet = new Set(selected)
  const ownedIds = new Set(data.nodes.filter((node) => node.type === "owned" && selectedSet.has(node.id)).map((node) => node.id))
  const edges = data.edges.filter((edge) => ownedIds.has(edge.from) || ownedIds.has(edge.to))
  const connected = new Set<string>()
  for (const edge of edges) {
    connected.add(edge.from)
    connected.add(edge.to)
  }
  return {
    nodes: data.nodes.filter((node) => connected.has(node.id)),
    edges,
    unmapped: data.unmapped.filter((key) => selectedSet.has(key)),
    noDoi: data.noDoi.filter((key) => selectedSet.has(key)),
  }
}

function Chips<T extends string>({ value, options, onChange }: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group">
      {options.map((o) => (
        <Toggle
          key={o.v}
          size="sm"
          variant="segment"
          className="!px-4"
          pressed={value === o.v}
          onPressedChange={(pressed) => {
            if (pressed) onChange(o.v)
          }}
        >
          {o.label}
        </Toggle>
      ))}
    </div>
  )
}

export default function GraphMode() {
  const { selectedKeys, setMany, clear } = useZoteroSelection()
  const { openPdf, setMode } = useWorkspace()

  // View controls.
  const [lens, setLens] = useState<Lens>("cite")
  const [layout, setLayout] = useState<GraphLayout>("network")
  const [colorCollections, setColorCollections] = useState(false)
  const [showTitles, setShowTitles] = useState(false)
  const [showConnections, setShowConnections] = useState(true)
  const [scaleByCitations, setScaleByCitations] = useState(true)

  // Data: one cached layer per lens (References / Cited by), tagged with their selection.
  const [refsLayer, setRefsLayer] = useState<Cached>(null)
  const [citedLayer, setCitedLayer] = useState<Cached>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("empty")
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { newRun, isStale, track, progress } = useSkillJob()

  const itemKeys = useMemo(() => Array.from(selectedKeys).sort(), [selectedKeys])
  const keysKey = itemKeys.join(",")

  // The active layer's data iff it was fetched for the current selection (else null -> fetch).
  const activeLayer = useMemo<DiscoveryGraph | null>(() => {
    const l = lens === "cite" ? refsLayer : citedLayer
    return l && l.keys === keysKey ? l.data : null
  }, [lens, refsLayer, citedLayer, keysKey])

  const displayLayer = useMemo<DiscoveryGraph | null>(() => {
    if (activeLayer) return activeLayer
    const stale = lens === "cite" ? refsLayer : citedLayer
    if (!stale || !selectedKeysOverlapCache(stale.keys, itemKeys)) return null
    return filterCachedGraphToSelection(stale.data, itemKeys)
  }, [activeLayer, citedLayer, itemKeys, lens, refsLayer])

  useEffect(() => setSelectedId(null), [keysKey])

  const jobRef = useRef<string | null>(null)

  // Render the active lens from cache immediately (whatever's already fetched), then stream the
  // rest in: fetch only the uncached papers and re-assemble as they land. Re-assembling on each
  // poll also picks up papers the background prefetch caches, so the graph keeps filling even
  // while our own fetch is queued behind it. On selection/lens change we cancel the abandoned
  // fetch so it stops hogging the single worker.
  useEffect(() => {
    if (itemKeys.length === 0) {
      setPhase("empty")
      return
    }
    const have = lens === "cite" ? refsLayer : citedLayer
    if (have && have.keys === keysKey && have.complete) {
      setPhase("ready")
      return
    }
    const t = newRun()
    const assemble = lens === "cite" ? fetchDiscoveryGraph : fetchCitingGraph
    const startFetch = lens === "cite" ? startGraphFetch : startCitingFetch
    const setLayer = lens === "cite" ? setRefsLayer : setCitedLayer
    const store = (data: DiscoveryGraph) =>
      setLayer({ keys: keysKey, data, complete: data.unmapped.length === 0 })
    setError(null)
    void (async () => {
      try {
        // 1. Instant render from the cache (cached/prefetched papers show right away).
        const g = await assemble(itemKeys)
        if (isStale(t)) return
        store(g)
        setPhase(g.nodes.length > 0 ? "ready" : "loading")
        if (g.unmapped.length === 0) return // fully cached - done

        // 2. Fetch only the uncached papers (small job; queues behind any prefetch).
        let jobId: string | null = null
        try {
          jobId = (await startFetch(g.unmapped)).jobId
          jobRef.current = jobId
        } catch {
          /* couldn't queue a fetch; a running prefetch may still fill the cache */
        }
        if (!jobId) return

        // 3. Stream: re-assemble on each poll as papers (ours or the prefetch's) land.
        const refresh = () => {
          void assemble(itemKeys)
            .then((ng) => { if (!isStale(t)) { store(ng); setPhase("ready") } })
            .catch(() => {})
        }
        await track(t, jobId, getGraphFetch, { onProgress: refresh, onDone: refresh, onError: () => {} })
        jobRef.current = null
      } catch {
        if (!isStale(t)) {
          const cur = lens === "cite" ? refsLayer : citedLayer
          if (!cur || cur.keys !== keysKey || cur.data.nodes.length === 0) {
            setError("Couldn't load citations.")
            setPhase("error")
          }
        }
      }
    })()

    return () => {
      if (jobRef.current) {
        void cancelGraphFetch(jobRef.current).catch(() => {})
        jobRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey, lens])

  // Map the OpenAlex graph (owned papers + external references/citers) into the renderer model.
  const composed = useMemo<{ nodes: AtlasNode[]; edges: AtlasEdge[] }>(() => {
    if (!displayLayer) return { nodes: [], edges: [] }
    const overlay = lens === "cite" ? "references" : "cited"
    const nodes: AtlasNode[] = displayLayer.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      year: n.year,
      date: n.date,
      citedBy: n.citedBy,
      globalCitedBy: n.globalCitedBy,
      doi: n.doi,
      collection: n.collection ?? null,
    }))
    const edges: AtlasEdge[] = displayLayer.edges.map((e) => ({
      source: e.from,
      target: e.to,
      direct: true,
      external: true,
      overlay,
    }))
    // Drop no-connection nodes (an owned paper with no references in OpenAlex would otherwise sit
    // as a lone dot, cluttering the map). The library greys + explains those instead.
    const connected = new Set<string>()
    for (const e of edges) { connected.add(e.source); connected.add(e.target) }
    return { nodes: nodes.filter((n) => connected.has(n.id)), edges }
  }, [displayLayer, lens])

  const ownedCount = useMemo(() => composed.nodes.filter((n) => n.type === "owned").length, [composed.nodes])
  const selectedNode = useMemo(() => composed.nodes.find((n) => n.id === selectedId) ?? null, [composed.nodes, selectedId])

  const narrate = useCallback((n: AtlasNode) => {
    // Narrate operates on the single selected paper - make this the selection, then jump to Narrate.
    clear()
    setMany([n.id], true)
    setMode("narrate")
  }, [clear, setMany, setMode])

  if (phase === "empty") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-sm font-medium">Map</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Select papers in the library to see what they cite and what cites them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-background">
        <div
          className="flex h-13 items-center gap-4 overflow-x-auto"
          style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-medium">Map</span>
            {ownedCount > 0 ? (
              <span className="shrink-0 text-muted-foreground">{composed.nodes.length} papers</span>
            ) : null}
          </div>
        </div>
        <div
          className="flex h-13 items-center gap-4 overflow-x-auto border-t"
          style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
        >
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Lens</span>
            <Chips<Lens>
              value={lens}
              options={[
                { v: "cite", label: "References" },
                { v: "cited", label: "Cited by" },
              ]}
              onChange={setLens}
            />
          </div>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Layout</span>
            <Chips<GraphLayout>
              value={layout}
              options={[{ v: "network", label: "Network" }, { v: "timeline", label: "Time Order" }]}
              onChange={setLayout}
            />
          </div>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">View</span>
            <Toggle size="sm" variant="segment" className="!px-4" pressed={colorCollections} onPressedChange={setColorCollections}>
              Collections
            </Toggle>
            <Toggle size="sm" variant="segment" className="!px-4" pressed={showTitles} onPressedChange={setShowTitles}>
              Titles
            </Toggle>
            <Toggle size="sm" variant="segment" className="!px-4" pressed={showConnections} onPressedChange={setShowConnections}>
              Connections
            </Toggle>
            <Toggle size="sm" variant="segment" className="!px-4" pressed={scaleByCitations} onPressedChange={setScaleByCitations}>
              Citation size
            </Toggle>
          </div>
        </div>

        <div
          className="border-t py-2 text-xs text-muted-foreground"
          style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
        >
          {DISCLOSURE}
        </div>
      </div>

      {phase === "loading" && ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="flex max-w-md items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {progress.detail || progress.stage || "Loading citations..."}
          </p>
        </div>
      ) : phase === "error" && ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">Couldn&apos;t load citations. {error}</p>
        </div>
      ) : ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            None of the selected papers have {lens === "cite" ? "references" : "citers"} in OpenAlex to map.
            Greyed papers in the library have no citation data - hover them to see why.
          </p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            data={composed}
            layout={layout}
            colorBy={colorCollections ? "collection" : "type"}
            showHulls={false}
            showLabels={showTitles}
            showConnections={showConnections}
            scaleByCitations={scaleByCitations}
            emphasis={null}
            selectedId={selectedId}
            layoutKey={lens}
            onSelectNode={(n) => setSelectedId(n.id)}
          />
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onClose={() => setSelectedId(null)}
              onOpenPdf={(n) => openPdf({ sourceId: n.id, title: n.label, page: 1 })}
              onNarrate={narrate}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
