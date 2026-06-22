"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"

import styles from "./PdfViewerPanel.module.css"

// react-force-graph touches the canvas/window, so load it client-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any

// One node type spanning both callers: the selection-scoped discovery map
// ({label, type, year, date, citedBy, globalCitedBy, doi}) and the agent's legacy
// intra-corpus citation widget ({title, refCount, citedBy} — all owned papers). Fields are
// optional so either shape flows through; rendering normalizes below.
export type GraphData = {
  nodes: {
    id: string
    label?: string
    title?: string
    type?: "owned" | "external"
    year?: string | number | null
    date?: string | null
    citedBy?: number | null
    globalCitedBy?: number | null
    refCount?: number | null
    doi?: string | null
  }[]
  edges: { from: string; to: string; viaTitle?: string }[]
}

export type GraphLayout = "network" | "timeline"
export type OpenNode = { id: string; title: string; type: "owned" | "external"; doi?: string | null }

const OWNED_COLOR = "#2563eb" // accent — your papers
const EXTERNAL_COLOR = "rgba(120,120,120,0.5)" // muted — referenced works

// Timeline coordinate space (centred on the origin); zoomToFit frames it on render.
const W = 900
const H = 560
const GUTTER = 110 // left park column for undated nodes

// Owned nodes scale with their global cited-by (log, since it spans 0..thousands).
// External nodes scale with their *within-selection* degree so shared anchors look bigger.
function nodeVal(type: "owned" | "external", citedBy: number, globalCitedBy: number): number {
  if (type === "owned") return 1 + Math.log10(globalCitedBy + 1)
  return 0.4 + Math.max(0, citedBy - 1) * 0.8
}

// Fractional publication year from a YYYY-MM-DD date, else the year field, else null.
// Guard against non-positive years: OpenAlex/Zotero can hand us a null year, and
// `Number(null) === 0`, which would otherwise pin a dateless paper to year 0 and crush
// the whole x-axis. Anything without a usable (> 0) year returns null → parked in the
// gutter, out of the time domain.
function yearValue(n: GraphData["nodes"][number]): number | null {
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

type Ticks = {
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
  undatedX: number | null
}

function computeTimeline(nodes: GraphData["nodes"]): {
  pos: Map<string, { x: number; y: number }>
  ticks: Ticks
} {
  const years = nodes.map(yearValue)
  const dated = years.filter((v): v is number => v != null)
  const tMin = dated.length ? Math.min(...dated) : 0
  const tMax = dated.length ? Math.max(...dated) : 1
  const tSpan = tMax - tMin || 1
  const cMax = Math.max(1, ...nodes.map((n) => n.globalCitedBy ?? n.citedBy ?? 0))
  const cLogMax = Math.log10(cMax + 1) || 1

  const pos = new Map<string, { x: number; y: number }>()
  nodes.forEach((n, i) => {
    const t = years[i]
    const cNorm = Math.log10((n.globalCitedBy ?? n.citedBy ?? 0) + 1) / cLogMax
    const y = H / 2 - cNorm * H
    const x = t == null ? -W / 2 - GUTTER : -W / 2 + ((t - tMin) / tSpan) * W
    pos.set(n.id, { x, y })
  })

  const xTicks: { x: number; label: string }[] = []
  if (dated.length) {
    const lo = Math.floor(tMin)
    const hi = Math.ceil(tMax)
    const step = Math.max(1, Math.ceil((hi - lo) / 7))
    for (let yr = lo; yr <= hi; yr += step) {
      xTicks.push({ x: -W / 2 + ((yr - tMin) / tSpan) * W, label: String(yr) })
    }
  }

  const yTicks = [0, 1, 10, 100, 1000, 10000]
    .filter((v) => v <= Math.max(cMax, 1))
    .map((v) => ({
      y: H / 2 - (Math.log10(v + 1) / cLogMax) * H,
      label: v >= 1000 ? `${v / 1000}k` : String(v),
    }))

  const undatedX = years.some((v) => v == null) ? -W / 2 - GUTTER : null

  return { pos, ticks: { xTicks, yTicks, undatedX } }
}

function drawAxes(ctx: CanvasRenderingContext2D, globalScale: number, ticks: Ticks) {
  ctx.save()
  ctx.lineWidth = 1 / globalScale
  ctx.strokeStyle = "rgba(0,0,0,0.06)"
  const fs = 11 / globalScale
  ctx.font = `${fs}px sans-serif`

  ctx.fillStyle = "rgba(0,0,0,0.4)"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  for (const t of ticks.xTicks) {
    ctx.beginPath()
    ctx.moveTo(t.x, -H / 2)
    ctx.lineTo(t.x, H / 2)
    ctx.stroke()
    ctx.fillText(t.label, t.x, H / 2 + 6 / globalScale)
  }

  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  for (const yt of ticks.yTicks) {
    ctx.beginPath()
    ctx.moveTo(-W / 2, yt.y)
    ctx.lineTo(W / 2, yt.y)
    ctx.stroke()
    ctx.fillText(yt.label, -W / 2 - 6 / globalScale, yt.y)
  }

  // Park column for papers we couldn't date — labelled so it doesn't read as "year 0".
  if (ticks.undatedX != null) {
    ctx.fillStyle = "rgba(0,0,0,0.4)"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("no date", ticks.undatedX, H / 2 + 6 / globalScale)
  }

  ctx.fillStyle = "rgba(0,0,0,0.5)"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.fillText("Publication year", 0, H / 2 + 22 / globalScale)
  ctx.translate(-W / 2 - 56 / globalScale, 0)
  ctx.rotate(-Math.PI / 2)
  ctx.textBaseline = "bottom"
  ctx.fillText("Citations (log)", 0, 0)
  ctx.restore()
}

export default function GraphView({
  data,
  layout = "network",
  onOpenNode,
}: {
  data: GraphData
  layout?: GraphLayout
  onOpenNode: (node: OpenNode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Size the canvas to the panel (rAF + equality guard, like PdfDocument).
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

  const visibleNodes = useMemo(
    () => (layout === "timeline" ? data.nodes.filter((n) => yearValue(n) != null) : data.nodes),
    [data, layout],
  )

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])

  const timeline = useMemo(
    () => (layout === "timeline" ? computeTimeline(visibleNodes) : null),
    [layout, visibleNodes],
  )

  const graphData = useMemo(
    () => ({
      nodes: visibleNodes.map((n) => {
        const type = n.type ?? "owned"
        const title = n.label ?? n.title ?? n.id
        const degree = n.citedBy ?? 0
        const global = n.globalCitedBy ?? n.citedBy ?? n.refCount ?? 0
        const node: Record<string, unknown> = {
          id: n.id,
          name: n.year ? `${title} (${n.year})` : title,
          title,
          type,
          doi: n.doi ?? null,
          degree,
          val: nodeVal(type, degree, global),
        }
        // Pin to the year×citations grid in timeline mode (fx/fy fix the d3 node).
        const p = timeline?.pos.get(n.id)
        if (p) {
          node.x = node.fx = p.x
          node.y = node.fy = p.y
        }
        return node
      }),
      links: data.edges
        .filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))
        .map((e) => ({ source: e.from, target: e.to })),
    }),
    [data.edges, timeline, visibleNodeIds, visibleNodes],
  )

  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return

    const raf = requestAnimationFrame(() => {
      fgRef.current?.d3ReheatSimulation?.()
    })

    return () => cancelAnimationFrame(raf)
  }, [graphData, layout, size.w, size.h])

  return (
    <div className={styles.graphWrap} ref={containerRef}>
      {size.w > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeId="id"
          nodeLabel="name"
          linkSource="source"
          linkTarget="target"
          nodeRelSize={4}
          // Let the engine tick even in timeline. Nodes are pinned (fx/fy) so they don't
          // move, but the ticks are what make d3 apply the pinned coords to the drawn x/y and
          // snap the links onto the pinned nodes. With 0 ticks the links keep their previous
          // (network-scale) positions while the nodes jump to the timeline grid.
          cooldownTicks={layout === "timeline" ? 100 : undefined}
          // Keep the redraw loop clearing every frame so pan/zoom never smears.
          autoPauseRedraw={false}
          onEngineStop={() => fgRef.current?.zoomToFit?.(400, 60)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeVal={(n: any) => n.val}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeColor={(n: any) => (n.type === "owned" ? OWNED_COLOR : EXTERNAL_COLOR)}
          linkColor={() => (layout === "timeline" ? "rgba(120,120,120,0.15)" : "rgba(120,120,120,0.35)")}
          linkDirectionalArrowLength={layout === "timeline" ? 0 : 3}
          linkDirectionalArrowRelPos={1}
          onRenderFramePre={
            layout === "timeline" && timeline
              ? (ctx: CanvasRenderingContext2D, globalScale: number) =>
                  drawAxes(ctx, globalScale, timeline.ticks)
              : undefined
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onNodeClick={(node: any) =>
            onOpenNode({ id: node.id, title: node.title, type: node.type, doi: node.doi })
          }
          nodeCanvasObjectMode={() => "after"}
          // Label owned papers + shared anchors (degree >= 2); the long single-cite tail
          // stays unlabeled to keep the map readable (titles are still on hover).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            if (node.type === "external" && node.degree < 2) return
            const label = String(node.title || "").slice(0, 30)
            const fontSize = 11 / scale
            ctx.font = `${fontSize}px sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "top"
            ctx.fillStyle = node.type === "owned" ? "rgba(37,99,235,0.9)" : "rgba(60,60,60,0.8)"
            ctx.fillText(label, node.x, node.y + 6 / scale)
          }}
        />
      ) : null}
    </div>
  )
}
