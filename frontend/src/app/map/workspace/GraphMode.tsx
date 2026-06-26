"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  fetchCitingGraph,
  fetchDiscoveryGraph,
  fetchFusedMap,
  getGraphFetch,
  startCitingFetch,
  startGraphFetch,
  type DiscoveryGraph,
  type FusedMap,
  type GraphNode,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob } from "./skillJob"
import GraphView, { type AtlasEdge, type AtlasNode, type ColorBy, type Emphasis, type GraphLayout } from "../components/GraphView"
import NodeInspector from "../components/NodeInspector"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"

// Citation "emphasis" over the same stable map: highlight what your papers cite / what cites
// them / both / the shared gaps. "none" is the pure fused Atlas.
type Connections = "none" | "cite" | "cited" | "both" | "gaps"

const GAP_MIN = 2 // an external cited by >= this many of your papers is a "gap" worth surfacing

const DISCLOSURE =
  "Citation overlays use OpenAlex (open scholarly data) - each selected paper's DOI fetches its " +
  "public references/citers."

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

const ownedNode = (n: FusedMap["nodes"][number]): AtlasNode => ({
  id: n.id,
  label: n.label,
  type: "owned",
  cluster: n.cluster,
  clusterLabel: n.clusterLabel,
  collection: n.collection,
  authors: n.authors,
  year: n.year,
  date: n.date,
  doi: n.doi,
  globalCitedBy: n.globalCitedBy,
  mapped: n.mapped,
})

const externalNode = (n: GraphNode): AtlasNode => ({
  id: n.id,
  label: n.label,
  type: "external",
  year: n.year,
  date: n.date,
  citedBy: n.citedBy,
  globalCitedBy: n.globalCitedBy,
  doi: n.doi,
})

export default function GraphMode() {
  const { selectedKeys, indexedKeys } = useZoteroSelection()
  const { setMany, clear } = useZoteroSelection()
  const { openPdf, setMode } = useWorkspace()

  // View controls.
  const [connections, setConnections] = useState<Connections>("none")
  const [colorBy, setColorBy] = useState<ColorBy>("cluster")
  const [layout, setLayout] = useState<GraphLayout>("network")
  const [showTitles, setShowTitles] = useState(false)
  const [showConnections, setShowConnections] = useState(true)
  const [scaleByCitations, setScaleByCitations] = useState(true)

  // Data.
  const [fused, setFused] = useState<FusedMap | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [refsLayer, setRefsLayer] = useState<DiscoveryGraph | null>(null)
  const [citedLayer, setCitedLayer] = useState<DiscoveryGraph | null>(null)
  const [layerBusy, setLayerBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { newRun, isStale, track } = useSkillJob()

  const itemKeys = useMemo(() => Array.from(selectedKeys).sort(), [selectedKeys])
  const keysKey = itemKeys.join(",")
  // Selected papers not yet indexed. When their indexing finishes they drop out of this set,
  // which re-fetches the map below so it reflects the new vectors without a manual refresh.
  const pendingIndexKey = useMemo(
    () => itemKeys.filter((k) => !indexedKeys.has(k)).join(","),
    [itemKeys, indexedKeys],
  )

  // Build the fused Atlas when the selection changes, and re-fetch it when a selected paper's
  // index status changes (indexing finishes -> its vector appears). A selection change is a
  // "hard" build (clear + show "building"); an index-status change is a "soft" refresh that keeps
  // the current graph on screen and swaps in the new one - so it never churns back to a spinner
  // while papers index one by one, and "index first" yields to the graph as nodes arrive. Pure
  // read - no OpenAlex gate.
  // The base-map build uses its OWN run counter, NOT useSkillJob's token. They must not share:
  // the citation-overlay effect below also calls newRun(), and when it runs in the same pass as a
  // selection-change build (overlay active) it would otherwise invalidate the build's token and
  // leave the map stuck on "building". This counter is only bumped here.
  const builtKeysRef = useRef<string | null>(null)
  const buildSeq = useRef(0)
  useEffect(() => {
    const seq = ++buildSeq.current
    const hard = builtKeysRef.current !== keysKey
    builtKeysRef.current = keysKey
    if (itemKeys.length === 0) {
      setFused(null)
      setRefsLayer(null)
      setCitedLayer(null)
      setSelectedId(null)
      setError(null)
      setPhase("empty")
      return
    }
    if (hard) {
      setFused(null)
      setRefsLayer(null)
      setCitedLayer(null)
      setSelectedId(null)
      setError(null)
      setPhase("loading")
    }
    void (async () => {
      try {
        const map = await fetchFusedMap(itemKeys)
        if (seq !== buildSeq.current) return
        setFused(map)
        setPhase("ready")
      } catch (e) {
        if (seq !== buildSeq.current) return
        // A soft-refresh failure keeps the current graph; only a hard build surfaces the error.
        if (hard) {
          setError(String(e))
          setPhase("error")
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey, pendingIndexKey])

  // Lazily fetch (and resolve) the citation satellite layer the chosen Connections mode needs.
  const needRefs = connections === "cite" || connections === "both" || connections === "gaps"
  const needCited = connections === "cited" || connections === "both"
  useEffect(() => {
    if (phase !== "ready" || itemKeys.length === 0) return
    const t = newRun()
    void (async () => {
      try {
        if (needRefs && !refsLayer) {
          setLayerBusy(true)
          const { jobId } = await startGraphFetch(itemKeys)
          await track(t, jobId, getGraphFetch, {
            onDone: async () => {
              const g = await fetchDiscoveryGraph(itemKeys)
              if (!isStale(t)) setRefsLayer(g)
            },
            fallbackError: "Citation fetch failed.",
          })
        }
        if (needCited && !citedLayer) {
          setLayerBusy(true)
          const { jobId } = await startCitingFetch(itemKeys)
          await track(t, jobId, getGraphFetch, {
            onDone: async () => {
              const g = await fetchCitingGraph(itemKeys)
              if (!isStale(t)) setCitedLayer(g)
            },
            fallbackError: "Citation fetch failed.",
          })
        }
      } catch {
        /* the base map stays usable; overlay just won't show */
      } finally {
        if (!isStale(t)) setLayerBusy(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, phase, keysKey, refsLayer, citedLayer])

  // Compose the rendered graph: the owned fused core, plus external satellites for the active mode.
  const composed = useMemo<{ nodes: AtlasNode[]; edges: AtlasEdge[] }>(() => {
    if (!fused) return { nodes: [], edges: [] }
    const nodes: AtlasNode[] = fused.nodes.map(ownedNode)
    const edges: AtlasEdge[] = fused.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      direct: e.citation.direct,
      direction: e.citation.direction,
    }))
    const seen = new Set(nodes.map((n) => n.id))

    const addLayer = (
      layer: DiscoveryGraph | null,
      overlay: "references" | "cited",
      keepExternal?: (n: GraphNode) => boolean,
    ) => {
      if (!layer) return
      const keep = new Set<string>()
      for (const n of layer.nodes) {
        if (n.type !== "external") continue
        if (keepExternal && !keepExternal(n)) continue
        keep.add(n.id)
        if (!seen.has(n.id)) { seen.add(n.id); nodes.push(externalNode(n)) }
      }
      for (const e of layer.edges) {
        if (keep.has(e.from) || keep.has(e.to)) {
          edges.push({ source: e.from, target: e.to, direct: true, external: true, overlay })
        }
      }
    }

    if (connections === "cite" || connections === "both") addLayer(refsLayer, "references")
    if (connections === "gaps") addLayer(refsLayer, "references", (n) => (n.citedBy ?? 0) >= GAP_MIN)
    if (connections === "cited" || connections === "both") addLayer(citedLayer, "cited")
    return { nodes, edges }
  }, [fused, connections, refsLayer, citedLayer])

  // Emphasis: the citation modes highlight their satellite edges/nodes; the fused ground dims.
  const emphasis = useMemo<Emphasis>(() => {
    if (connections === "none") return null
    const ids = new Set<string>()
    for (const e of composed.edges) {
      if (e.external) { ids.add(e.source); ids.add(e.target) }
    }
    if (ids.size === 0) return null
    return { nodeIds: ids, isActiveEdge: (e) => !!e.external }
  }, [connections, composed.edges])

  const selectedNode = useMemo(() => composed.nodes.find((n) => n.id === selectedId) ?? null, [composed.nodes, selectedId])

  const narrate = useCallback((n: AtlasNode) => {
    // Narrate operates on the single selected paper - make this the selection, then jump to Narrate.
    clear()
    setMany([n.id], true)
    setMode("narrate")
  }, [clear, setMany, setMode])

  // --- empty / loading / error ---------------------------------------------
  if (phase === "empty") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-sm font-medium">Map</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Select papers in the library to map them. The map clusters your papers by content <em>and</em>
          citations; overlay what they cite.
        </p>
      </div>
    )
  }

  const clusters = fused?.clusters.filter((c) => c.label && c.size >= 2) ?? []
  const ownedCount = fused?.nodes.length ?? 0
  const visibleCount = fused?.nodes.length ?? itemKeys.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-background">
        <div
          className="flex h-13 items-center gap-4 overflow-x-auto"
          style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-medium">Map</span>
            <span className="shrink-0 text-muted-foreground">{visibleCount} papers</span>
            {clusters.length > 0 ? <Badge variant="secondary">{clusters.length} clusters</Badge> : null}
            {fused && fused.missing.length > 0 ? <Badge variant="outline">{fused.missing.length} not indexed</Badge> : null}
            {layerBusy ? (
              <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Citations...
              </span>
            ) : null}
          </div>
        </div>
        <div
          className="flex h-13 items-center gap-4 overflow-x-auto border-t"
          style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
        >
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Overlay</span>
            <Chips<Connections>
              value={connections}
              options={[
                { v: "none", label: "Map" },
                { v: "cite", label: "References" },
                { v: "cited", label: "Cited by" },
              ]}
              onChange={setConnections}
            />
          </div>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Color</span>
            <Chips<ColorBy>
              value={colorBy}
              options={[{ v: "cluster", label: "Clusters" }, { v: "collection", label: "Collections" }]}
              onChange={setColorBy}
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
            <Toggle
              size="sm"
              variant="segment"
              className="!px-4"
              pressed={showTitles}
              onPressedChange={setShowTitles}
            >
              Titles
            </Toggle>
            <Toggle
              size="sm"
              variant="segment"
              className="!px-4"
              pressed={showConnections}
              onPressedChange={setShowConnections}
            >
              Connections
            </Toggle>
            <Toggle
              size="sm"
              variant="segment"
              className="!px-4"
              pressed={scaleByCitations}
              onPressedChange={setScaleByCitations}
            >
              Citation size
            </Toggle>
          </div>
        </div>

        {connections !== "none" ? (
          <div
            className="border-t py-2 text-xs text-muted-foreground"
            style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
          >
            {DISCLOSURE}
          </div>
        ) : null}
      </div>

      {phase === "loading" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="flex max-w-md items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Building the map...
          </p>
        </div>
      ) : phase === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">Could not build the map. {error}</p>
        </div>
      ) : ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">The selected papers are not indexed yet - index them in the library first.</p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            data={composed}
            layout={layout}
            colorBy={colorBy}
            showHulls
            showLabels={showTitles}
            showConnections={showConnections}
            scaleByCitations={scaleByCitations}
            emphasis={emphasis}
            selectedId={selectedId}
            layoutKey={keysKey}
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
