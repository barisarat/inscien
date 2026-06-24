"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  fetchCitingGraph,
  fetchDiscoveryGraph,
  fetchFusedMap,
  fetchIndexedKeys,
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  getGraphFetch,
  startCitingFetch,
  startGraphFetch,
  type DiscoveryGraph,
  type FusedMap,
  type GraphNode,
  type ZoteroCollection,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob } from "./skillJob"
import GraphView, { type AtlasEdge, type AtlasNode, type ColorBy, type Emphasis, type GraphLayout } from "../components/GraphView"
import NodeInspector, { type Neighbor } from "../components/NodeInspector"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Toggle } from "@/components/ui/toggle"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Citation "emphasis" over the same stable map: highlight what your papers cite / what cites
// them / both / the shared gaps. "none" is the pure fused Atlas.
type Connections = "none" | "cite" | "cited" | "both" | "gaps"
type Scope = { kind: "selection" } | { kind: "library" } | { kind: "collection"; id: number; name: string }

const GAP_MIN = 2 // an external cited by >= this many of your papers is a "gap" worth surfacing

const DISCLOSURE =
  "Citation overlays use OpenAlex (open scholarly data) - each selected paper's DOI fetches its " +
  "public references/citers. This is the only feature that reaches the internet."

const workspaceRowStyle = { paddingLeft: 24, paddingRight: 24 }

function Chips<T extends string>({ value, options, onChange }: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {options.map((o) => (
        <Toggle
          key={o.v}
          size="sm"
          variant="outline"
          className="bg-background"
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
  const { selectedKeys } = useZoteroSelection()
  const { setMany, clear } = useZoteroSelection()
  const { openPdf, setMode } = useWorkspace()

  const [scope, setScope] = useState<Scope>({ kind: "selection" })
  const [scopeKeys, setScopeKeys] = useState<string[]>([])
  const [collections, setCollections] = useState<{ id: number; name: string; depth: number }[]>([])

  // View controls.
  const [connections, setConnections] = useState<Connections>("none")
  const [colorBy, setColorBy] = useState<ColorBy>("cluster")
  const [showClusters, setShowClusters] = useState(true)
  const [layout, setLayout] = useState<GraphLayout>("network")

  // Data.
  const [fused, setFused] = useState<FusedMap | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [refsLayer, setRefsLayer] = useState<DiscoveryGraph | null>(null)
  const [citedLayer, setCitedLayer] = useState<DiscoveryGraph | null>(null)
  const [layerBusy, setLayerBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { newRun, isStale, track } = useSkillJob()

  // Flat collection list for the scope dropdown.
  useEffect(() => {
    void (async () => {
      try {
        const { collections } = await fetchZoteroCollections()
        const flat: { id: number; name: string; depth: number }[] = []
        const walk = (nodes: ZoteroCollection[], depth: number) => {
          for (const c of nodes) {
            flat.push({ id: c.collectionID, name: c.name, depth })
            walk(c.children || [], depth + 1)
          }
        }
        walk(collections, 0)
        setCollections(flat)
      } catch {
        /* navigator surfaces the real error */
      }
    })()
  }, [])

  // Resolve the chosen scope -> the item keys the map runs over.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (scope.kind === "selection") {
        setScopeKeys(Array.from(selectedKeys).sort())
        return
      }
      try {
        const res = scope.kind === "library" ? await fetchIndexedKeys() : await fetchZoteroIndexableKeys(scope.id)
        if (!cancelled) setScopeKeys([...res.itemKeys].sort())
      } catch {
        if (!cancelled) setScopeKeys([])
      }
    })()
    return () => { cancelled = true }
  }, [scope, selectedKeys])

  const itemKeys = scopeKeys
  const keysKey = itemKeys.join(",")

  // Build the fused Atlas whenever the scope changes. Pure read - no OpenAlex gate.
  useEffect(() => {
    const t = newRun()
    setFused(null)
    setRefsLayer(null)
    setCitedLayer(null)
    setSelectedId(null)
    setError(null)
    if (itemKeys.length === 0) {
      setPhase("empty")
      return
    }
    setPhase("loading")
    void (async () => {
      try {
        const map = await fetchFusedMap(itemKeys)
        if (isStale(t)) return
        setFused(map)
        setPhase("ready")
      } catch (e) {
        if (isStale(t)) return
        setError(String(e))
        setPhase("error")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey])

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

    const addLayer = (layer: DiscoveryGraph | null, keepExternal?: (n: GraphNode) => boolean) => {
      if (!layer) return
      const keep = new Set<string>()
      for (const n of layer.nodes) {
        if (n.type !== "external") continue
        if (keepExternal && !keepExternal(n)) continue
        keep.add(n.id)
        if (!seen.has(n.id)) { seen.add(n.id); nodes.push(externalNode(n)) }
      }
      for (const e of layer.edges) {
        if (keep.has(e.from) || keep.has(e.to)) edges.push({ source: e.from, target: e.to, direct: true, external: true })
      }
    }

    if (connections === "cite" || connections === "both") addLayer(refsLayer)
    if (connections === "gaps") addLayer(refsLayer, (n) => (n.citedBy ?? 0) >= GAP_MIN)
    if (connections === "cited" || connections === "both") addLayer(citedLayer)
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

  // Strongest neighbours of the selected node (for the inspect panel) - derived from edges.
  const neighbors = useMemo<Neighbor[]>(() => {
    if (!selectedId) return []
    const labelOf = new Map(composed.nodes.map((n) => [n.id, n.label]))
    const out: Neighbor[] = []
    for (const e of composed.edges) {
      const other = e.source === selectedId ? e.target : e.target === selectedId ? e.source : null
      if (other && labelOf.has(other)) out.push({ id: other, label: labelOf.get(other)!, weight: e.weight ?? (e.direct ? 1 : 0.3), direct: !!e.direct })
    }
    out.sort((a, b) => b.weight - a.weight)
    return out.slice(0, 6)
  }, [selectedId, composed])

  const selectedNode = useMemo(() => composed.nodes.find((n) => n.id === selectedId) ?? null, [composed.nodes, selectedId])

  const narrate = useCallback((n: AtlasNode) => {
    // Narrate operates on the single selected paper - make this the selection, then jump to Narrate.
    clear()
    setMany([n.id], true)
    setMode("narrate")
  }, [clear, setMany, setMode])

  const scopeControl = (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Toggle
        size="sm"
        variant="outline"
        className="bg-background"
        pressed={scope.kind === "selection"}
        onPressedChange={(pressed) => {
          if (pressed) setScope({ kind: "selection" })
        }}
      >
        Selection
      </Toggle>
      <Toggle
        size="sm"
        variant="outline"
        className="bg-background"
        pressed={scope.kind === "library"}
        onPressedChange={(pressed) => {
          if (pressed) setScope({ kind: "library" })
        }}
      >
        Library
      </Toggle>
      <Select
        value={scope.kind === "collection" ? String(scope.id) : ""}
        onValueChange={(v) => {
          const id = Number(v)
          const c = collections.find((x) => x.id === id)
          if (c) setScope({ kind: "collection", id, name: c.name })
        }}
      >
        <SelectTrigger size="sm" className="w-[170px] max-w-full">
          <SelectValue placeholder="Collection" />
        </SelectTrigger>
        <SelectContent>
          {collections.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>{`${"  ".repeat(c.depth)}${c.name}`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  // --- empty / loading / error ---------------------------------------------
  if (phase === "empty") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-lg font-medium">Map</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Select papers in the library to map them - or choose a whole collection / your whole library
          below. The Atlas clusters your papers by content <em>and</em> citations; overlay what they cite.
        </p>
        {scopeControl}
      </div>
    )
  }
  if (phase === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Building the Atlas
        </p>
      </div>
    )
  }
  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-lg font-medium">Map</h2>
        <p className="max-w-md text-sm text-muted-foreground">Couldn't build the map. {error}</p>
        {scopeControl}
      </div>
    )
  }

  const clusters = fused?.clusters.filter((c) => c.label && c.size >= 2) ?? []
  const ownedCount = fused?.nodes.length ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b bg-background">
        <div className="flex min-h-13 flex-wrap items-center justify-between gap-4 py-2" style={workspaceRowStyle}>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-medium">Atlas</span>
            <span className="shrink-0 text-muted-foreground">{ownedCount} papers</span>
            {clusters.length > 0 ? <Badge variant="secondary">{clusters.length} clusters</Badge> : null}
            {fused && fused.missing.length > 0 ? <Badge variant="outline">{fused.missing.length} not indexed</Badge> : null}
            {layerBusy ? (
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> citations
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 justify-end">{scopeControl}</div>
        </div>
        <div className="flex min-h-13 items-center gap-7 overflow-x-auto border-t py-2.5" style={workspaceRowStyle}>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Overlay</span>
            <Chips<Connections>
              value={connections}
              options={[
                { v: "none", label: "Map" },
                { v: "cite", label: "References" },
                { v: "cited", label: "Cited by" },
                { v: "both", label: "Both" },
                { v: "gaps", label: "Gaps" },
              ]}
              onChange={setConnections}
            />
          </div>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Color</span>
            <Chips<ColorBy>
              value={colorBy}
              options={[{ v: "cluster", label: "Clusters" }, { v: "collection", label: "Collections" }]}
              onChange={setColorBy}
            />
            <Toggle size="sm" variant="outline" className="bg-background" pressed={showClusters} onPressedChange={setShowClusters}>
              Hulls
            </Toggle>
          </div>
          <Separator orientation="vertical" className="h-6 shrink-0" />
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Layout</span>
            <Chips<GraphLayout>
              value={layout}
              options={[{ v: "network", label: "Network" }, { v: "timeline", label: "Timeline" }]}
              onChange={setLayout}
            />
          </div>
        </div>

        {connections !== "none" ? <div className="border-t py-1.5 text-xs text-muted-foreground" style={workspaceRowStyle}>{DISCLOSURE}</div> : null}
      </div>

      {ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">The selected papers aren't indexed yet - index them in the library first.</p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            data={composed}
            layout={layout}
            colorBy={colorBy}
            showHulls={showClusters}
            emphasis={emphasis}
            selectedId={selectedId}
            layoutKey={keysKey}
            onSelectNode={(n) => setSelectedId(n.id)}
          />
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              neighbors={neighbors}
              onClose={() => setSelectedId(null)}
              onOpenPdf={(n) => openPdf({ sourceId: n.id, title: n.label, page: 1 })}
              onNarrate={narrate}
              onSelectNeighbor={(id) => setSelectedId(id)}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
