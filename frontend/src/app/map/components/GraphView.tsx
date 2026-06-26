"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"

import styles from "./PdfViewerPanel.module.css"

// react-force-graph touches the canvas/window, so load it client-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as any

export type GraphLayout = "network" | "timeline"
export type ColorBy = "type" | "cluster" | "collection"

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
  overlay?: "references" | "cited"
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
  if (colorBy === "type") return palette().owned
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

function citationScore(n: AtlasNode): number {
  if (n.globalCitedBy != null && n.globalCitedBy > 0) return n.globalCitedBy
  return Math.max(0, n.citedBy ?? 0)
}

function citationScale(nodes: AtlasNode[]): Map<string, number> {
  const scores = nodes.map((node) => Math.log10(citationScore(node) + 1))
  const min = scores.length ? Math.min(...scores) : 0
  const max = scores.length ? Math.max(...scores) : 0
  const span = max - min
  const values = new Map<string, number>()

  nodes.forEach((node, index) => {
    const normalized = span > 0 ? (scores[index] - min) / span : 0
    const shaped = Math.max(0, Math.min(1, normalized)) ** 0.8
    const minVal = node.type === "owned" ? 1.2 : 0.8
    const maxVal = node.type === "owned" ? 9.5 : 6.25
    values.set(node.id, minVal + (maxVal - minVal) * shaped)
  })
  return values
}

// --- time-order layout: keep the network, nudge x-position by effective date ----------------
const TIME_ORDER_W = 880
const TIME_ORDER_LANE_H = 34
const TIME_ORDER_LANES = 12

type TimeOrderPosition = { x: number; y: number }
type RuntimeNode = {
  id: string
  type?: AtlasNode["type"]
  __src?: AtlasNode
  val?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}
type RuntimeLink = {
  source: string | RuntimeNode
  target: string | RuntimeNode
  __e?: AtlasEdge
}
type ComponentPlacement = {
  component: RuntimeNode[]
  x: number
  y: number
  width: number
  height: number
  radius: number
}

function yearValue(n: AtlasNode): number | null {
  if (n.type === "owned" && n.year != null && n.year !== "") {
    const y = Number(n.year)
    if (Number.isFinite(y) && y > 0) return y
  }

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

    const isReferenceEdge = edge.overlay === "references" || (!edge.overlay && source.type === "owned")
    const isCitedEdge = edge.overlay === "cited" || (!edge.overlay && source.type === "external")

    if (isReferenceEdge && source.type === "owned" && target.type === "external" && sourceYear != null && targetYear != null) {
      if (Math.floor(targetYear) > Math.floor(sourceYear)) invalidExternal.add(target.id)
    }
    if (isCitedEdge && source.type === "external" && target.type === "owned" && sourceYear != null && targetYear != null) {
      if (Math.floor(sourceYear) < Math.floor(targetYear)) invalidExternal.add(source.id)
    }
  })

  invalidExternal.forEach((id) => years.delete(id))
  return years
}

function timeOrderLane(index: number): number {
  const lane = index % TIME_ORDER_LANES
  const step = Math.floor(lane / 2) + 1
  return (lane % 2 === 0 ? -step : step) * TIME_ORDER_LANE_H
}

function computeTimeOrder(nodes: AtlasNode[], yearsById: Map<string, number>): Map<string, TimeOrderPosition> {
  const years = nodes.map((n) => yearsById.get(n.id) ?? null)
  const dated = years.filter((v): v is number => v != null)
  const tMin = dated.length ? Math.min(...dated) : 0
  const tMax = dated.length ? Math.max(...dated) : 1
  const span = tMax - tMin || 1

  const ordered = [...nodes].sort((a, b) => {
    const ay = yearsById.get(a.id) ?? 0
    const by = yearsById.get(b.id) ?? 0
    return ay === by ? a.id.localeCompare(b.id) : ay - by
  })
  const yById = new Map<string, number>()
  let externalIndex = 0
  let ownedIndex = 0
  for (const n of ordered) {
    if (n.type === "owned") {
      yById.set(n.id, ownedIndex === 0 ? 0 : timeOrderLane(ownedIndex - 1))
      ownedIndex += 1
    } else {
      yById.set(n.id, timeOrderLane(externalIndex))
      externalIndex += 1
    }
  }

  const positionById = new Map<string, TimeOrderPosition>()
  nodes.forEach((n, i) => {
    const t = years[i]
    if (t != null) {
      positionById.set(n.id, {
        x: -TIME_ORDER_W / 2 + ((t - tMin) / span) * TIME_ORDER_W,
        y: yById.get(n.id) ?? 0,
      })
    }
  })
  return positionById
}

function timeOrderForce(positionById: Map<string, TimeOrderPosition>) {
  let nodes: RuntimeNode[] = []
  const yStrength = 0.16
  const force = (alpha: number) => {
    for (const node of nodes) {
      const target = positionById.get(node.id)
      if (target == null || node.y == null) continue
      node.vy = (node.vy ?? 0) + (target.y - node.y) * yStrength * alpha
    }
  }
  force.initialize = (next: unknown[]) => {
    nodes = next as RuntimeNode[]
  }
  return force
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableUnit(value: string): number {
  return stableHash(value) / 0xffffffff
}

function compactCenterForce(strength: number) {
  let nodes: RuntimeNode[] = []
  const force = (alpha: number) => {
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue
      node.vx = (node.vx ?? 0) - node.x * strength * alpha
      node.vy = (node.vy ?? 0) - node.y * strength * alpha
    }
  }
  force.initialize = (next: unknown[]) => {
    nodes = next as RuntimeNode[]
  }
  return force
}

function nodeCollisionRadius(node: RuntimeNode): number {
  return Math.max(4.5, Math.sqrt(node.val ?? 1) * 3.2) + 3
}

function collisionForce(strength: number) {
  let nodes: RuntimeNode[] = []
  const force = (alpha: number) => {
    const pull = strength * alpha
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a.x == null || a.y == null) continue
      const ar = nodeCollisionRadius(a)
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        if (b.x == null || b.y == null) continue
        const br = nodeCollisionRadius(b)
        const minDistance = ar + br
        let dx = b.x - a.x
        let dy = b.y - a.y
        let distance = Math.sqrt(dx * dx + dy * dy)
        if (distance >= minDistance) continue
        if (distance === 0) {
          const angle = stableUnit(`${a.id}:${b.id}`) * Math.PI * 2
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          distance = 1
        }
        const push = ((minDistance - distance) / distance) * pull
        const offsetX = dx * push
        const offsetY = dy * push
        a.vx = (a.vx ?? 0) - offsetX
        a.vy = (a.vy ?? 0) - offsetY
        b.vx = (b.vx ?? 0) + offsetX
        b.vy = (b.vy ?? 0) + offsetY
      }
    }
  }
  force.initialize = (next: unknown[]) => {
    nodes = next as RuntimeNode[]
  }
  return force
}

function endpointId(endpoint: string | RuntimeNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id
}

function endpointNode(endpoint: string | RuntimeNode): RuntimeNode | null {
  return typeof endpoint === "string" ? null : endpoint
}

function linkDegreeById(links: RuntimeLink[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const link of links) {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    degree.set(source, (degree.get(source) ?? 0) + 1)
    degree.set(target, (degree.get(target) ?? 0) + 1)
  }
  return degree
}

function networkLinkDistance(link: RuntimeLink, degreeById: Map<string, number>): number {
  const source = endpointNode(link.source)
  const target = endpointNode(link.target)
  const sourceRadius = source ? nodeCollisionRadius(source) : 8
  const targetRadius = target ? nodeCollisionRadius(target) : 8
  const hubDegree = Math.max(degreeById.get(endpointId(link.source)) ?? 1, degreeById.get(endpointId(link.target)) ?? 1)
  const hubSpacing = Math.min(96, Math.sqrt(hubDegree) * 12)
  return Math.max(42, sourceRadius + targetRadius + hubSpacing)
}

function connectedComponents(nodes: RuntimeNode[], links: RuntimeLink[]): RuntimeNode[][] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacent = new Map(nodes.map((node) => [node.id, new Set<string>()]))
  for (const link of links) {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    if (!byId.has(source) || !byId.has(target)) continue
    adjacent.get(source)?.add(target)
    adjacent.get(target)?.add(source)
  }

  const seen = new Set<string>()
  const components: RuntimeNode[][] = []
  for (const node of nodes) {
    if (seen.has(node.id)) continue
    const component: RuntimeNode[] = []
    const queue = [node.id]
    seen.add(node.id)
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]
      const current = byId.get(id)
      if (!current) continue
      component.push(current)
      for (const next of adjacent.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(component)
  }
  return components
}

function componentEstimatedRadius(component: RuntimeNode[]): number {
  const nodeArea = component.reduce((sum, node) => sum + nodeCollisionRadius(node) * nodeCollisionRadius(node), 0)
  return Math.max(28, Math.sqrt(nodeArea) * 1.12, Math.sqrt(component.length) * 8)
}

function componentPosition(component: RuntimeNode[]): { x: number; y: number; radius: number } | null {
  let sx = 0
  let sy = 0
  let count = 0
  for (const node of component) {
    if (node.x == null || node.y == null) continue
    sx += node.x
    sy += node.y
    count += 1
  }
  if (count === 0) return null

  const x = sx / count
  const y = sy / count
  let radius = componentEstimatedRadius(component)
  for (const node of component) {
    if (node.x == null || node.y == null) continue
    radius = Math.max(radius, Math.hypot(node.x - x, node.y - y) + nodeCollisionRadius(node))
  }
  return { x, y, radius }
}

function centeredCompactComponentPlacements(components: RuntimeNode[][]): ComponentPlacement[] {
  const gap = 16
  const boxes = components.map((component) => {
    const radius = componentEstimatedRadius(component)
    return { component, radius, width: radius * 2, height: radius * 2 }
  })
  const placements: ComponentPlacement[] = []
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (const box of boxes) {
    if (placements.length === 0) {
      placements.push({ ...box, x: 0, y: 0 })
      continue
    }

    let placed: ComponentPlacement | null = null
    const step = Math.max(12, box.radius * 0.4)
    const maxAttempts = 900
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const angle = attempt * goldenAngle
      const distance = step * Math.sqrt(attempt)
      const x = Math.cos(angle) * distance
      const y = Math.sin(angle) * distance
      const overlaps = placements.some((placement) => {
        const dx = x - placement.x
        const dy = y - placement.y
        const minDistance = box.radius + placement.radius + gap
        return dx * dx + dy * dy < minDistance * minDistance
      })
      if (!overlaps) {
        placed = { ...box, x, y }
        break
      }
    }

    placements.push(placed ?? { ...box, x: placements.length * (box.radius + gap), y: 0 })
  }

  const minX = Math.min(...placements.map((p) => p.x - p.radius))
  const maxX = Math.max(...placements.map((p) => p.x + p.radius))
  const minY = Math.min(...placements.map((p) => p.y - p.radius))
  const maxY = Math.max(...placements.map((p) => p.y + p.radius))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return placements.map((placement) => ({
    ...placement,
    x: placement.x - centerX,
    y: placement.y - centerY,
  }))
}

function compactComponentPlacements(components: RuntimeNode[][]): ComponentPlacement[] {
  const gap = 16
  const anchored: ComponentPlacement[] = []
  const unplaced: RuntimeNode[][] = []

  for (const component of components) {
    const position = componentPosition(component)
    if (!position) {
      unplaced.push(component)
      continue
    }
    anchored.push({
      component,
      x: position.x,
      y: position.y,
      radius: position.radius,
      width: position.radius * 2,
      height: position.radius * 2,
    })
  }

  if (anchored.length === 0) return centeredCompactComponentPlacements(components)

  const placements = [...anchored]
  const center = {
    x: anchored.reduce((sum, placement) => sum + placement.x, 0) / anchored.length,
    y: anchored.reduce((sum, placement) => sum + placement.y, 0) / anchored.length,
  }
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  for (const component of unplaced) {
    const radius = componentEstimatedRadius(component)
    const box = { component, radius, width: radius * 2, height: radius * 2 }
    let placed: ComponentPlacement | null = null
    const step = Math.max(10, radius * 0.36)
    const maxAttempts = 1200

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const angle = attempt * goldenAngle + stableUnit(component[0]?.id ?? String(attempt)) * 0.5
      const distance = step * Math.sqrt(attempt)
      const x = center.x + Math.cos(angle) * distance
      const y = center.y + Math.sin(angle) * distance
      const overlaps = placements.some((placement) => {
        const dx = x - placement.x
        const dy = y - placement.y
        const minDistance = radius + placement.radius + gap
        return dx * dx + dy * dy < minDistance * minDistance
      })
      if (!overlaps) {
        placed = { ...box, x, y }
        break
      }
    }

    placements.push(placed ?? { ...box, x: center.x + placements.length * (radius + gap), y: center.y })
  }

  return placements
}

function compactComponentTargetById(nodes: RuntimeNode[], links: RuntimeLink[]): Map<string, { x: number; y: number }> {
  const components = connectedComponents(nodes, links)
    .filter((component) => component.length > 0)
    .sort((a, b) => b.length - a.length)
  const targets = new Map<string, { x: number; y: number }>()
  for (const placement of compactComponentPlacements(components)) {
    let sx = 0
    let sy = 0
    let count = 0
    for (const node of placement.component) {
      if (node.x == null || node.y == null) continue
      sx += node.x
      sy += node.y
      count += 1
    }
    const target = count > 0 ? { x: sx / count, y: sy / count } : { x: placement.x, y: placement.y }
    for (const node of placement.component) targets.set(node.id, target)
  }
  return targets
}

function seedFromLinkedPositions(
  id: string,
  links: RuntimeLink[],
  positions: Map<string, { x: number; y: number }>,
): { x: number; y: number } | null {
  let sx = 0
  let sy = 0
  let count = 0
  for (const link of links) {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    const otherId = source === id ? target : target === id ? source : null
    if (!otherId) continue
    const position = positions.get(otherId)
    if (!position) continue
    sx += position.x
    sy += position.y
    count += 1
  }
  if (count === 0) return null
  return {
    x: sx / count,
    y: sy / count,
  }
}

function seedCompactNetwork(nodes: RuntimeNode[], links: RuntimeLink[]) {
  const components = connectedComponents(nodes, links)
    .filter((component) => component.length > 0)
    .sort((a, b) => b.length - a.length)
  if (components.length === 0) return

  for (const { component, x, y } of compactComponentPlacements(components)) {
    const seeded = component.filter((node) => node.x == null || node.y == null)
    seeded.forEach((node, index) => {
      if (seeded.length === 1) {
        node.x = x
        node.y = y
        return
      }
      const angle = (index / seeded.length) * Math.PI * 2 + stableUnit(node.id) * 0.18
      const radius = Math.max(12, Math.sqrt(seeded.length) * 3.1)
      node.x = x + Math.cos(angle) * radius
      node.y = y + Math.sin(angle) * radius
    })
  }
}

function componentPackForce(targetById: Map<string, { x: number; y: number }>, strength: number) {
  let nodes: RuntimeNode[] = []
  const force = (alpha: number) => {
    const groups = new Map<string, { target: { x: number; y: number }; sx: number; sy: number; count: number }>()
    for (const node of nodes) {
      const target = targetById.get(node.id)
      if (!target || node.x == null || node.y == null) continue
      const key = `${target.x}:${target.y}`
      const group = groups.get(key) ?? { target, sx: 0, sy: 0, count: 0 }
      group.sx += node.x
      group.sy += node.y
      group.count += 1
      groups.set(key, group)
    }

    for (const node of nodes) {
      const target = targetById.get(node.id)
      if (!target) continue
      const group = groups.get(`${target.x}:${target.y}`)
      if (!group || group.count === 0) continue
      const cx = group.sx / group.count
      const cy = group.sy / group.count
      node.vx = (node.vx ?? 0) + (target.x - cx) * strength * alpha
      node.vy = (node.vy ?? 0) + (target.y - cy) * strength * alpha
    }
  }
  force.initialize = (next: unknown[]) => {
    nodes = next as RuntimeNode[]
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
  const forceConfigKeyRef = useRef("")
  const fitKeyRef = useRef("")

  // A fresh scope means a fresh layout - drop remembered positions.
  useEffect(() => {
    posRef.current = new Map()
    forceConfigKeyRef.current = ""
    fitKeyRef.current = ""
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
    const links = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, __e: e }))
    const citationValues = scaleByCitations ? citationScale(visibleNodes) : null
    const nodes = visibleNodes.map((n) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const node: any = { id: n.id, __src: n, type: n.type, val: citationValues?.get(n.id) ?? 1.05 }
      const remembered = posRef.current.get(n.id)
      if (remembered) {
        node.x = remembered.x
        node.y = remembered.y
      }
      const linkedSeed = remembered ? null : seedFromLinkedPositions(n.id, links, posRef.current)
      const seed = linkedSeed ?? clusterCentroid(n.cluster)
      if (!remembered && seed) {
        const angle = stableUnit(n.id) * Math.PI * 2
        const distance = 8 + stableUnit(`${n.id}:distance`) * 18
        node.x = seed.x + Math.cos(angle) * distance
        node.y = seed.y + Math.sin(angle) * distance
      }
      const timePosition = timeOrder?.get(n.id)
      if (timePosition != null) {
        node.x = timePosition.x
        node.y = timePosition.y
        node.fx = timePosition.x
        node.fy = undefined
      }
      return node
    })
    if (layout === "network") seedCompactNetwork(nodes, links)
    return { nodes, links }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.edges, layout, scaleByCitations, timeOrder, visibleIds, visibleNodes])

  // Capture settled positions so subsequent renders pin them.
  const capturePositions = (nodes = graphData.nodes) => {
    if (layout !== "network") return
    for (const n of nodes) {
      if (n.x != null && n.y != null) posRef.current.set(n.id, { x: n.x, y: n.y })
    }
  }

  const configureLayoutForces = useCallback(() => {
    const graph = fgRef.current
    if (!graph) return
    graph.d3Force?.("timeOrderSpread", null)
    graph.d3Force?.("nodeCollision", null)
    const linkForce = graph.d3Force?.("link")
    const chargeForce = graph.d3Force?.("charge")
    const centerForce = graph.d3Force?.("center")
    const runtimeData = graph.graphData?.() as { nodes?: RuntimeNode[]; links?: RuntimeLink[] } | undefined
    const packTargets =
      layout === "network" && Array.isArray(runtimeData?.nodes) && Array.isArray(runtimeData?.links)
        ? compactComponentTargetById(runtimeData.nodes, runtimeData.links)
        : null
    const degreeById = Array.isArray(runtimeData?.links) ? linkDegreeById(runtimeData.links) : new Map<string, number>()
    graph.d3Force?.("componentPack", packTargets ? componentPackForce(packTargets, 0.55) : null)
    graph.d3Force?.("compactCenter", layout === "network" ? compactCenterForce(0.018) : null)
    graph.d3Force?.("nodeCollision", layout === "network" ? collisionForce(0.58) : null)
    if (layout === "network") {
      linkForce?.distance?.((link: RuntimeLink) => networkLinkDistance(link, degreeById))
      linkForce?.strength?.(0.55)
      chargeForce?.strength?.(-22)
      centerForce?.strength?.(0.12)
    } else {
      linkForce?.distance?.(30)
      linkForce?.strength?.(0.5)
      chargeForce?.strength?.(-30)
      centerForce?.strength?.(0.05)
    }
    if (layout === "timeline" && timeOrder) {
      graph.d3Force?.("timeOrderSpread", timeOrderForce(timeOrder))
    }
  }, [layout, timeOrder])

  const dimNode = (id: string) => emphasis?.nodeIds != null && !emphasis.nodeIds.has(id)
  const forceConfigKey = `${layoutKey}:${layout}:${visibleNodes.length}:${data.edges.length}:${size.w}x${size.h}`
  const fitKey = `${layoutKey}:${layout}:${visibleNodes.length}:${data.edges.length}:${scaleByCitations}:${size.w}x${size.h}`

  useLayoutEffect(() => {
    if (size.w <= 0 || size.h <= 0 || !fgRef.current) return
    configureLayoutForces()
    forceConfigKeyRef.current = forceConfigKey
  }, [configureLayoutForces, forceConfigKey, graphData, size.h, size.w])

  useEffect(() => {
    const graph = fgRef.current
    if (size.w <= 0 || size.h <= 0 || !graph) return
    configureLayoutForces()
    graph.d3AlphaTarget?.(layout === "network" ? 0.08 : 0.03)
    graph.d3ReheatSimulation?.()
    const timeout = window.setTimeout(() => graph.d3AlphaTarget?.(0), layout === "network" ? 1050 : 450)
    return () => {
      window.clearTimeout(timeout)
      graph.d3AlphaTarget?.(0)
    }
  }, [configureLayoutForces, graphData, layout, size.h, size.w])

  const fitToView = useCallback((duration = 0) => {
    const graph = fgRef.current
    if (!graph) return
    const runtimeData = graph.graphData?.() as { nodes?: RuntimeNode[] } | undefined
    const nodes = Array.isArray(runtimeData?.nodes) ? runtimeData.nodes : graphData.nodes
    const placed = nodes.filter((node) => node.x != null && node.y != null)
    if (placed.length === 0) return

    const minX = Math.min(...placed.map((node) => node.x ?? 0))
    const maxX = Math.max(...placed.map((node) => node.x ?? 0))
    const minY = Math.min(...placed.map((node) => node.y ?? 0))
    const maxY = Math.max(...placed.map((node) => node.y ?? 0))
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)
    const count = placed.length
    const padding = count <= 4
      ? Math.max(28, Math.min(size.w, size.h) * 0.08)
      : Math.max(52, Math.min(size.w, size.h) * 0.07)
    const maxZoom = count <= 1 ? 5.2 : count <= 2 ? 4.2 : count <= 4 ? 3.35 : count <= 12 ? 2.65 : 2.1
    const availableW = Math.max(1, size.w - padding * 2)
    const availableH = Math.max(1, size.h - padding * 2)
    const targetZoom = Math.min(maxZoom, availableW / width, availableH / height)

    graph.centerAt?.((minX + maxX) / 2, (minY + maxY) / 2, duration)
    graph.zoom?.(targetZoom, duration)
  }, [graphData.nodes, size.h, size.w])

  useEffect(() => {
    if (size.w <= 0 || size.h <= 0 || !fgRef.current || visibleNodes.length === 0) return
    if (fitKeyRef.current === fitKey) return
    const timeout = window.setTimeout(() => {
      fitKeyRef.current = fitKey
      fitToView(520)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [fitKey, fitToView, size.h, size.w, visibleNodes.length])

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
          nodeRelSize={2.65}
          warmupTicks={0}
          cooldownTicks={layout === "timeline" ? 100 : 120}
          autoPauseRedraw={false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkStrength={(l: any) => (
            layout === "network"
              ? 0.55
              : Math.min(1, Math.max(0.05, (l.__e?.weight ?? 0.3)))
          )}
          onEngineTick={() => {
            const runtimeData = fgRef.current?.graphData?.() as { nodes?: RuntimeNode[]; links?: RuntimeLink[] } | undefined
            capturePositions(Array.isArray(runtimeData?.nodes) ? runtimeData.nodes : undefined)
            if (forceConfigKeyRef.current !== forceConfigKey) {
              forceConfigKeyRef.current = forceConfigKey
              configureLayoutForces()
            }
          }}
          onEngineStop={() => {
            const runtimeData = fgRef.current?.graphData?.() as { nodes?: RuntimeNode[]; links?: RuntimeLink[] } | undefined
            capturePositions(Array.isArray(runtimeData?.nodes) ? runtimeData.nodes : undefined)
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
