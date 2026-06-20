"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"

import styles from "./PdfViewerPanel.module.css"

// react-force-graph touches the canvas/window, so load it client-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any

export type GraphData = {
  nodes: { id: string; title: string; refCount?: number; citedBy?: number }[]
  edges: { from: string; to: string; viaTitle?: string }[]
}

export default function GraphView({
  data,
  onOpenNode,
}: {
  data: GraphData
  onOpenNode: (node: { id: string; title: string }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
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

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ id: n.id, name: n.title, citedBy: n.citedBy ?? 0 })),
      links: data.edges.map((e) => ({ source: e.from, target: e.to })),
    }),
    [data],
  )

  return (
    <div className={styles.graphWrap} ref={containerRef}>
      {size.w > 0 ? (
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeLabel="name"
          nodeRelSize={5}
          nodeColor={() => "#2563eb"}
          linkColor={() => "rgba(120,120,120,0.4)"}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onNodeClick={(node: any) => onOpenNode({ id: node.id, title: node.name })}
          nodeCanvasObjectMode={() => "after"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const label = String(node.name || "").slice(0, 30)
            const fontSize = 11 / scale
            ctx.font = `${fontSize}px sans-serif`
            ctx.textAlign = "center"
            ctx.textBaseline = "top"
            ctx.fillStyle = "rgba(60,60,60,0.85)"
            ctx.fillText(label, node.x, node.y + 7 / scale)
          }}
        />
      ) : null}
    </div>
  )
}
