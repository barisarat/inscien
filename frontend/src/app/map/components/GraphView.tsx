"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"

import styles from "./PdfViewerPanel.module.css"

// react-force-graph touches the canvas/window, so load it client-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any

export type GraphLayout = "network" | "timeline"
export type ColorBy = "cluster" | "collection"

// The renderer's unified node/edge model. The Atlas (fused map) supplies owned nodes; the
// citation satellite layer (OpenAlex discovery/citing) supplies external nodes - both flow in here.
export interface AtlasNode {
  id: string
  label: string
  type: "owned" | "external"
  cluster?: number | null
  clusterLabel?: string | null
  collection?: string | null
  authors?: string[]
  year?: string | number | null
  date?: string | null
  citedBy?: number | null // external: within-selection degree (shared anchors render bigger)
  globalCitedBy?: number | null
  doi?: string | null
  mapped?: boolean // owned: false = has a vector but no OpenAlex record yet (semantic-only)
}

export interface AtlasEdge {
  source: string
  target: string
  weight?: number
  direct?: boolean // a real citation (vs a semantic/coupling link)
  direction?: "AtoB" | "BtoA" | "both" | null
  external?: boolean // belongs to the citation satellite layer (owned<->external), not the fused core
}

export type Emphasis = {
  nodeIds: Set<string> | null // keep these bright; dim the rest. null = everything bright.
  isActiveEdge?: (e: AtlasEdge) => boolean // edges to highlight (others fade)
} | null

// The canvas palette lives in design tokens (--graph-* in globals.css). We read it once via
// getComputedStyle and cache it, so a token change reaches the map and nothing is hardcoded.
// Fallbacks match the tokens for SSR / when the stylesheet has not applied yet.
const GRAPH_FALLBACK = {
  owned: "#2563eb",
  external: "#8b92a5",
  clusters: [
    "#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed",
    "#0891b2", "#dc2626", "#65a30d", "#9333ea", "#0d9488",
    "#ea580c", "#0ea5e9", "#be123c", "#4d7c0f", "#7e22ce",
  ],
  edge: "rgba(0,0,0,0.06)",
  cited: "rgba(37,99,235,0.45)",
  citedStrong: "rgba(37,99,235,0.9)",
  label: "rgba(74,79,94,0.85)",
}

let _palette: typeof GRAPH_FALLBACK | null = null
function palette(): typeof GRAPH_FALLBACK {
  if (_palette) return _palette
  if (typeof window === "undefined") return GRAPH_FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  _palette = {
    owned: v("--graph-owned", GRAPH_FALLBACK.owned),
    external: v("--graph-external", GRAPH_FALLBACK.external),
    clusters: GRAPH_FALLBACK.clusters.map((f, i) => v(`--graph-${i + 1}`, f)),
    edge: v("--graph-edge", GRAPH_FALLBACK.edge),
    cited: v("--graph-cited", GRAPH_FALLBACK.cited),
    citedStrong: v("--graph-cited-strong", GRAPH_FALLBACK.citedStrong),
    label: v("--graph-label", GRAPH_FALLBACK.label),
  }
  return _palette
}

function collectionColor(name?: string | null): string {
  const clusters = palette().clusters
  if (!name) return palette().owned
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return clusters[h % clusters.length]
}

function clusterColor(cluster?: number | null): string {
  if (cluster == null) return palette().external
  const clusters = palette().clusters
  return clusters[cluster % clusters.length]
}

function nodeColorFor(n: AtlasNode, colorBy: ColorBy): string {
  if (n.type === "external") return palette().external
  return colorBy === "cluster" ? clusterColor(n.cluster) : collectionColor(n.collection)
}

// Apply alpha to a hex / named color (cheap: wrap in rgba via a tiny hex parse).
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    let r: number, g: number, b: number
    if (color.length === 4) {
      r = parseInt(color[1] + color[1], 16)
      g = parseInt(color[2] + color[2], 16)
      b = parseInt(color[3] + color[3], 16)
    } else {
      r = parseInt(color.slice(1, 3), 16)
      g = parseInt(color.slice(3, 5), 16)
      b = parseInt(color.slice(5, 7), 16)
    }
    return `rgba(${r},${g},${b},${alpha})`
  }
  return color
}

function nodeVal(n: AtlasNode): number {
  if (n.type === "owned") return 0.75 + Math.min(4.5, Math.log10((n.globalCitedBy ?? 0) + 1) * 0.9)
  if (n.globalCitedBy != null) return 0.75 + Math.min(4.5, Math.log10(n.globalCitedBy + 1) * 0.9)
  return 0.55 + Math.min(2.4, Math.max(0, (n.citedBy ?? 0) - 1) * 0.65)
}

// --- time-order layout: keep the network, nudge x-position by effective date ----------------
const TIME_ORDER_W = 880

function yearValue(n: AtlasNode): number | null {
  const d = n.date
  if (typeof d === "string" && /^\d{4}/.test(d)) {
    const [y, m = "1", day = "1"] = d.split("-")
    const yi = Number(y)
    if (yi > 0) return yi + ((Number(m) - 1) + (Number(day) - 1) / 31) / 12
  }
  if (n.year == null || n.year === "") return null
  const y = Number(n.year)
  return Number.isFinite(y) && y > 0 ? y : null
}

function timelineYears(nodes: AtlasNode[], edges: AtlasEdge[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const base = new Map<string, number>()
  nodes.forEach((n) => {
    const year = yearValue(n)
    if (year != null) base.set(n.id, year)
  })
  const years = new Map(base)
  const invalidExternal = new Set<string>()

  edges.forEach((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return

    const sourceYear = base.get(source.id)
    const targetYear = base.get(target.id)

    if (source.type === "owned" && target.type === "external" && sourceYear != null && targetYear != null) {
      if (targetYear > sourceYear) invalidExternal.add(target.id)
    }
    if (source.type === "external" && target.type === "owned" && sourceYear != null && targetYear != null) {
      if (sourceYear < targetYear) invalidExternal.add(source.id)
    }
  })

  invalidExternal.forEach((id) => years.delete(id))
  return years
}

function computeTimeOrder(nodes: AtlasNode[], yearsById: Map<string, number>): Map<string, number> {
  const years = nodes.map((n) => yearsById.get(n.id) ?? null)
  const dated = years.filter((v): v is number => v != null)
  const tMin = dated.length ? Math.min(...dated) : 0
  const tMax = dated.length ? Math.max(...dated) : 1
  const span = tMax - tMin || 1

  const xById = new Map<string, number>()
  nodes.forEach((n, i) => {
    const t = years[i]
    if (t != null) xById.set(n.id, -TIME_ORDER_W / 2 + ((t - tMin) / span) * TIME_ORDER_W)
  })
  return xById
}

function timeOrderForce(xById: Map<string, number>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodes: any[] = []
  const strength = 0.22
  const force = (alpha: number) => {
    for (const node of nodes) {
      const target = xById.get(node.id)
      if (target == null || node.x == null) continue
      node.vx += (target - node.x) * strength * alpha
    }
  }
  force.initialize = (next: unknown[]) => {
    nodes = next
  }
  return force
}

// --- convex hull (Andrew's monotone chain) for cluster blobs --------------------------------
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts
  const p = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: { x: number; y: number }[] = []
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: { x: number; y: number }[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop()
    upper.push(pt)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function drawHulls(
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[],
) {
  const groups = new Map<number, { x: number; y: number }[]>()
  const labels = new Map<number, string>()
  for (const n of nodes) {
    if (n.type !== "owned" || n.cluster == null || n.x == null) continue
    if (!groups.has(n.cluster)) groups.set(n.cluster, [])
    groups.get(n.cluster)!.push({ x: n.x, y: n.y })
    if (n.clusterLabel && !labels.has(n.cluster)) labels.set(n.cluster, n.clusterLabel)
  }
  const pad = 18 / globalScale
  for (const [cluster, pts] of groups) {
    if (pts.length < 2) continue
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const color = clusterColor(cluster)
    ctx.save()
    ctx.fillStyle = withAlpha(color, 0.07)
    ctx.strokeStyle = withAlpha(color, 0.25)
    ctx.lineWidth = 1.5 / globalScale
    if (pts.length >= 3) {
      const hull = convexHull(pts).map((p) => ({
        x: p.x + (p.x - cx === 0 ? 0 : Math.sign(p.x - cx)) * pad + (p.x - cx) * 0.12,
        y: p.y + (p.y - cy === 0 ? 0 : Math.sign(p.y - cy)) * pad + (p.y - cy) * 0.12,
      }))
      ctx.beginPath()
      hull.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    } else {
      const r = Math.max(pad, Math.hypot(pts[0].x - cx, pts[0].y - cy) + pad)
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke()
    }
    const label = labels.get(cluster)
    if (label) {
      const minY = Math.min(...pts.map((p) => p.y))
      ctx.fillStyle = withAlpha(color, 0.85)
      ctx.font = `600 ${12 / globalScale}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "bottom"
      ctx.fillText(label, cx, minY - pad - 4 / globalScale)
    }
    ctx.restore()
  }
}

export default function GraphView({
  data,
  layout = "network",
  colorBy = "cluster",
  showHulls = true,
  showLabels = false,
  showConnections = true,
  scaleByCitations = true,
  emphasis = null,
  selectedId = null,
  layoutKey = "",
  onSelectNode,
}: {
  data: { nodes: AtlasNode[]; edges: AtlasEdge[] }
  layout?: GraphLayout
  colorBy?: ColorBy
  showHulls?: boolean
  showLabels?: boolean
  showConnections?: boolean
  scaleByCitations?: boolean
  emphasis?: Emphasis
  selectedId?: string | null
  layoutKey?: string // changes only when the underlying owned scope changes -> fresh layout
  onSelectNode: (node: AtlasNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Persistent positions so emphasis/satellite toggles never relayout the ground.
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const fitKeyRef = useRef("")

  // A fresh scope means a fresh layout - drop remembered positions.
  useEffect(() => {
    posRef.current = new Map()
  }, [layoutKey])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = entries[0]?.contentRect
        if (!r) return
        const w = Math.round(r.width)
        const h = Math.round(r.height)
        setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
      })
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const timelineYearMap = useMemo(() => timelineYears(data.nodes, data.edges), [data.edges, data.nodes])
  const visibleNodes = useMemo(
    () => (layout === "timeline" ? data.nodes.filter((n) => timelineYearMap.has(n.id)) : data.nodes),
    [data.nodes, layout, timelineYearMap],
  )
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const timeOrder = useMemo(
    () => (layout === "timeline" ? computeTimeOrder(visibleNodes, timelineYearMap) : null),
    [layout, timelineYearMap, visibleNodes],
  )

  // Centroid of a cluster's already-placed nodes - so a newly-added node starts near its kin.
  const clusterCentroid = (cluster: number | null | undefined) => {
    if (cluster == null) return null
    let sx = 0, sy = 0, k = 0
    for (const n of visibleNodes) {
      if (n.type === "owned" && n.cluster === cluster) {
        const p = posRef.current.get(n.id)
        if (p) { sx += p.x; sy += p.y; k++ }
      }
    }
    return k ? { x: sx / k, y: sy / k } : null
  }

  const graphData = useMemo(() => {
    const nodes = visibleNodes.map((n) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = { id: n.id, __src: n, type: n.type, val: scaleByCitations ? nodeVal(n) : 1.05 }
      const remembered = posRef.current.get(n.id)
      if (remembered) {
        node.x = node.fx = remembered.x
        node.y = node.fy = remembered.y // pin known network nodes so the ground stays put
      }
      const seed = clusterCentroid(n.cluster)
      if (!remembered && seed) { node.x = seed.x + (Math.random() - 0.5) * 30; node.y = seed.y + (Math.random() - 0.5) * 30 }
      if (timeOrder?.has(n.id)) node.fx = undefined
      return node
    })
    const links = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, __e: e }))
    return { nodes, links }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.edges, scaleByCitations, timeOrder, visibleIds, visibleNodes])

  // Capture settled positions so subsequent renders pin them.
  const capturePositions = () => {
    if (layout !== "network") return
    for (const n of graphData.nodes) {
      if (n.x != null && n.y != null) posRef.current.set(n.id, { x: n.x, y: n.y })
    }
  }

  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return
    const raf = requestAnimationFrame(() => fgRef.current?.d3ReheatSimulation?.())
    return () => cancelAnimationFrame(raf)
  }, [graphData, layout, size.w, size.h])

  useEffect(() => {
    if (layout !== "network") return
    const graph = fgRef.current
    const nodes = graph?.graphData?.()?.nodes
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      node.fx = undefined
      node.fy = undefined
    }
    graph.d3ReheatSimulation?.()
  }, [layout])

  const applyLayoutForces = useCallback(() => {
    const graph = fgRef.current
    if (!graph) return
    graph.d3Force?.("x", null)
    if (layout === "timeline" && timeOrder) {
      graph.d3Force?.("x", timeOrderForce(timeOrder))
    }
    graph.d3ReheatSimulation?.()
  }, [layout, timeOrder])

  useEffect(() => {
    applyLayoutForces()
  }, [applyLayoutForces, graphData])

  const dimNode = (id: string) => emphasis?.nodeIds != null && !emphasis.nodeIds.has(id)

  const fitToView = () => {
    const graph = fgRef.current
    if (!graph) return
    const padding = Math.max(120, Math.min(size.w, size.h) * 0.18)
    graph.zoomToFit?.(0, padding)
    const zoom = graph.zoom?.()
    if (typeof zoom === "number" && zoom > 1.1) graph.zoom?.(1.1, 0)
  }

  const fitKey = `${layoutKey}:${layout}:${visibleNodes.length}:${visibleIds.size}`

  return (
    <div className={styles.graphWrap} ref={containerRef}>
      {size.w > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeId="id"
          linkSource="source"
          linkTarget="target"
          nodeRelSize={2.35}
          cooldownTicks={layout === "timeline" ? 100 : 120}
          autoPauseRedraw={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkStrength={(l: any) => Math.min(1, Math.max(0.05, (l.__e?.weight ?? 0.3)))}
          onEngineStop={() => {
            capturePositions()
            if (fitKeyRef.current !== fitKey) {
              fitKeyRef.current = fitKey
              fitToView()
            }
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeVal={(n: any) => n.val}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeColor={(n: any) => {
            const base = nodeColorFor(n.__src, colorBy)
            return dimNode(n.id) ? withAlpha(base, 0.12) : base
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkColor={(l: any) => {
            if (!showConnections) return "rgba(0,0,0,0)"
            const active = emphasis?.isActiveEdge ? emphasis.isActiveEdge(l.__e) : true
            const cited = l.__e?.direct
            if (!active) return withAlpha(palette().external, 0.06)
            if (cited) return palette().cited
            return withAlpha(palette().external, layout === "timeline" ? 0.18 : 0.35)
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkWidth={(l: any) => (showConnections ? (l.__e?.direct ? 1.6 : 1) : 0)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkDirectionalArrowLength={(l: any) => (showConnections && l.__e?.direct ? 3 : 0)}
          linkDirectionalArrowRelPos={1}
          onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
            if (showHulls && colorBy === "cluster") drawHulls(ctx, globalScale, graphData.nodes)
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onNodeClick={(node: any) => onSelectNode(node.__src as AtlasNode)}
          nodeLabel={(node: { __src: AtlasNode }) => node.__src.label}
          nodeCanvasObjectMode={() => "after"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const src = node.__src as AtlasNode
            const dim = dimNode(node.id)
            if (node.id === selectedId) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, 3 + 7 / scale, 0, 2 * Math.PI)
              ctx.strokeStyle = palette().citedStrong
              ctx.lineWidth = 1.5 / scale
              ctx.stroke()
            }
            if (!showLabels) return
            if (src.type === "external" && (src.citedBy ?? 0) < 2 && node.id !== selectedId) return
            if (dim && node.id !== selectedId) return
            const label = String(src.label || "").slice(0, 32)
            ctx.font = `${11 / scale}px sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "top"
            ctx.fillStyle = src.type === "owned" ? palette().citedStrong : palette().label
            ctx.fillText(label, node.x, node.y + 6 / scale)
          }}
        />
      ) : null}
    </div>
  )
}
