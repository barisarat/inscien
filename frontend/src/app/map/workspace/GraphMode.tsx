"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
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

// A cached layer, tagged with the selection it was fetched for so a selection change invalidates
// it cleanly (no stale-graph flash) while a mode toggle keeps both layers warm.
type Cached = { keys: string; data: DiscoveryGraph } | null

const DISCLOSURE =
  "Citation data is from OpenAlex (open scholarly data) - each paper's DOI fetches its public " +
  "references and citers."

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

  useEffect(() => setSelectedId(null), [keysKey])

  // Fetch + assemble the active citation layer. The whole-library prefetch usually means the
  // assemble call returns from cache instantly; the fetch job covers anything not yet cached.
  useEffect(() => {
    if (itemKeys.length === 0) {
      setPhase("empty")
      return
    }
    if (activeLayer) {
      setPhase("ready")
      return
    }
    const t = newRun()
    setError(null)
    setPhase("loading")
    void (async () => {
      try {
        if (lens === "cite") {
          const { jobId } = await startGraphFetch(itemKeys)
          await track(t, jobId, getGraphFetch, {
            onDone: async () => {
              const g = await fetchDiscoveryGraph(itemKeys)
              if (!isStale(t)) { setRefsLayer({ keys: keysKey, data: g }); setPhase("ready") }
            },
            onError: () => { if (!isStale(t)) setPhase("error") },
            fallbackError: "Couldn't load citations.",
          })
        } else {
          const { jobId } = await startCitingFetch(itemKeys)
          await track(t, jobId, getGraphFetch, {
            onDone: async () => {
              const g = await fetchCitingGraph(itemKeys)
              if (!isStale(t)) { setCitedLayer({ keys: keysKey, data: g }); setPhase("ready") }
            },
            onError: () => { if (!isStale(t)) setPhase("error") },
            fallbackError: "Couldn't load citations.",
          })
        }
      } catch {
        if (!isStale(t)) { setError("Couldn't load citations."); setPhase("error") }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey, lens, activeLayer])

  // Map the OpenAlex graph (owned papers + external references/citers) into the renderer model.
  const composed = useMemo<{ nodes: AtlasNode[]; edges: AtlasEdge[] }>(() => {
    if (!activeLayer) return { nodes: [], edges: [] }
    const overlay = lens === "cite" ? "references" : "cited"
    const nodes: AtlasNode[] = activeLayer.nodes.map((n) => ({
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
    const edges: AtlasEdge[] = activeLayer.edges.map((e) => ({
      source: e.from,
      target: e.to,
      direct: true,
      external: true,
      overlay,
    }))
    return { nodes, edges }
  }, [activeLayer, lens])

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
            {phase === "ready" ? (
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

      {phase === "loading" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="flex max-w-md items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {progress.detail || progress.stage || "Loading citations..."}
          </p>
        </div>
      ) : phase === "error" ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">Couldn&apos;t load citations. {error}</p>
        </div>
      ) : ownedCount === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-md text-sm text-muted-foreground">
            None of the selected papers have citation data. Pick papers with a DOI (greyed papers in the library have none).
          </p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GraphView
            data={composed}
            layout={layout}
            colorBy="collection"
            showHulls={false}
            showLabels={showTitles}
            showConnections={showConnections}
            scaleByCitations={scaleByCitations}
            emphasis={null}
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
