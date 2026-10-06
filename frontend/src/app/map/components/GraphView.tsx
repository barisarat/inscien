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
  venue?: string | null
  narrationUrl?: string | null
  year?: string | number | null
  month?: number | null
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

function nodeColorFor(n: AtlasNode, colorBy: ColorBy, ownedColors?: Map<string, string>): string {
  if (n.type === "external") return palette().external
  const own = ownedColors?.get(n.id)
  if (own) return own
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

// Citation size is BUCKETED, not continuous - a small set of visibly distinct steps, the way
// S/M/L/XL are distinct, rather than a smooth function nobody can read off the screen. The
// breakpoints below are the buckets, and everything at or above the last one draws the same: past
// a few hundred citations the difference between 800 and 3900 is not something the eye should be
// asked to judge, and letting one landmark stretch the scale is what made every other node look
// alike in the first place.
//
// The same array drives the citation FILTER in the header, so what you can filter by and what you
// can see are the same set of thresholds.
// Six tiers - xs, s, m, l, xl, xxl. Retuned when counts moved to Semantic Scholar: on the
// deposit-limited OpenAlex numbers these thresholds topped out at 500, and with S2 counts (median
// 173, p90 4393, max 26783) that put 73 of 234 references in the top bucket - a size scale whose
// largest step means "somewhere between 500 and twenty-six thousand". These spread the same
// library across 33/57/64/37/22/21. The absolute maximum is deliberately not a factor; the tiers
// are categories, not a scale.
export const CITATION_TIERS = [25, 100, 400, 1500, 5000]

export function citationTier(count: number): number {
  let tier = 0
  for (const edge of CITATION_TIERS) if (count >= edge) tier += 1
  return tier // 0 (under 25) .. 5 (5000+)
}

// force-graph treats `nodeVal` as an AREA - the drawn radius is `sqrt(val) * nodeRelSize` - so
// evenly spaced SIZES need squared vals. These are the radii the tiers should draw at, in the
// nodeRelSize=2.65 space the renderer uses, converted once here rather than tuned by eye.
const TIER_RADIUS_EXTERNAL = [3, 5.6, 8.2, 10.8, 13.4, 16]
const TIER_RADIUS_OWNED = [9, 11.2, 13.4, 15.6, 17.8, 20]
const NODE_REL_SIZE = 2.65
const asVal = (radius: number) => (radius / NODE_REL_SIZE) ** 2

export function tierRadius(node: AtlasNode): number {
  const tier = citationTier(citationScore(node))
  return (node.type === "owned" ? TIER_RADIUS_OWNED : TIER_RADIUS_EXTERNAL)[tier]
}

// Floor on the drawn radius. Uniform shrinking is fine until the smallest tier disappears - at
// which point the size ranking stops being readable at exactly the end where most nodes are.
const MIN_DRAW_RADIUS = 2.6
function citationScale(nodes: AtlasNode[], shrink = 1): Map<string, number> {
  const values = new Map<string, number>()
  for (const node of nodes) {
    values.set(node.id, asVal(Math.max(MIN_DRAW_RADIUS, tierRadius(node) * shrink)))
  }
  return values
}

// The largest factor the tier radii can keep without any two nodes overlapping at their laid-out
// positions. Sizes are a ranking, not a measurement, so shrinking them all by the same factor
// costs nothing legible - where overlap costs a great deal, because two merged circles read as
// one node of the wrong size. Floored so a crowded view stays visible rather than vanishing.
const NODE_GAP = 6 // includes room for the ring drawn around a shared reference

// The shared ring is cut into one arc per citing paper. Four is the cap: five arcs on a node a
// few pixels across are indistinguishable from a dotted line, and it matches the 4+ bucket the
// Shared by filter stops at.
const MAX_RING_ARCS = 4
const RING_GAP_PX = 3

// The ring sits this far outside a shared node's own circle, and the stroke straddles the line -
// so the outer edge of what is DRAWN is the node radius plus this plus half the stroke. Shared
// with the hit area, which claims exactly that and no more.
const RING_OFFSET_PX = 2.5
const RING_STROKE_PX = 2

// Arc colours. Per citing paper while the edge palette can still be told apart; past that the
// arcs stay countable but go one colour, because eight near-identical hues claim a precision the
// eye cannot collect. Same fallback when a node's citing papers are unknown - a filtered-out
// edge, say - so the arc count never silently disagrees with citedBy.
const RING_COLOR_LIMIT = 8
function ringColors(citing: string[] | undefined, ownedColors: Map<string, string>, arcs: number): string[] {
  const plain = palette().citedStrong
  if (!citing || ownedColors.size === 0 || ownedColors.size > RING_COLOR_LIMIT) {
    return Array.from({ length: arcs }, () => plain)
  }
  return Array.from({ length: arcs }, (_, i) => ownedColors.get(citing[i] ?? "") ?? plain)
}
const MIN_SHRINK = 0.62
function fitNodeScale(nodes: AtlasNode[], positions: Map<string, TimeOrderPosition>): number {
  const placed = nodes
    .map((n) => ({ p: positions.get(n.id), r: tierRadius(n) }))
    .filter((e): e is { p: TimeOrderPosition; r: number } => e.p != null)
  let shrink = 1
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      const distance = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)
      const room = (distance - NODE_GAP) / (a.r + b.r)
      if (room < shrink) shrink = room
    }
  }
  return Math.max(MIN_SHRINK, Math.min(1, shrink))
}

// --- ordered layout: time on x by RANK, influence on y by RANK -----------------------------
//
// Neither axis uses raw values, and that is the whole idea. A reference list spans 1968 to 2025
// but only touches a dozen distinct years, so a year-valued x axis is mostly empty space that
// exists because of arithmetic rather than because anything is there. Ranking removes it: the
// years present are sorted, and each one is a single step from the next. Whether the gap is one
// year or thirty does not change the distance, so the scale problem cannot arise.
//
// y ranks by citation count, most-cited at the top, so influence reads down the surface while
// time reads across it. Magnitude is not lost - node size already carries it (see citationScale).
// The grid is sized to the VIEWPORT, not to how many rows and columns happen to survive. Fixed
// steps per column looked fine unfiltered and collapsed under a filter: filtering to 2020+ left
// six year columns, so a fixed 120px step gave a 600px-wide field against a 2000px-tall one, and
// the fitted result was a narrow ribbon down the middle of an empty canvas. The minimums below
// only take over when the viewport would pack things tighter than they can be read.
const FILL = 0.86      // fraction of the canvas the grid spans before fitting
// Column widths are weighted by how many references each year holds and sum to the canvas width,
// so there is no single "step" any more. What survives of that idea is MIN_COLUMN_W, which stops
// a one-reference year collapsing to a line.
// How much of a column width the months are allowed to use. Just under 1 so a December and the
// following January stay distinguishable instead of landing on top of each other.
const MONTH_SPREAD = 0.86
// A year column never narrower than this, so a single-reference year is still a place.
const MIN_COLUMN_W = 26
// How far a node may be nudged from its column centre, as a fraction of that column width. Half
// a width means it can reach the column edge and no further - crossing it would put the node in
// another year, which is the one thing the x axis promises not to do.
const MAX_DRIFT = 0.5
// Your own papers are offset half a column, so a paper never shares an x with the references it
// cites. They are a different kind of thing and reading them out of the reference stack is the
// whole point of the map.
const OWNED_COLUMN_OFFSET = 0.5

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

// Every node keeps the year it printed. There used to be a rule here that DELETED the year of a
// reference dated later than the paper citing it, on the theory that a paper cannot cite the
// future. It is a legacy of the OpenAlex-era map and it was silently destructive: a year-less node
// is placed in the undated column, so on the LLM4IR survey - whose own year resolved to 2023 from
// its arXiv v1 record while it cites 81 papers from 2024 - a quarter of the references were
// relocated to the far left of the axis, reading as the oldest work on the map.
//
// A reference newer than its citing paper is a metadata discrepancy (a preprint year against a
// camera-ready), not grounds for erasing a date the reference itself printed. It is also ill-posed
// once several papers are selected: an external node is shared, so "newer than the citing paper"
// has no single answer.
function timelineYears(nodes: AtlasNode[]): Map<string, number> {
  const years = new Map<string, number>()
  for (const n of nodes) {
    const year = yearValue(n)
    if (year != null) years.set(n.id, year)
  }
  return years
}

function computeTimeOrder(nodes: AtlasNode[], yearsById: Map<string, number>, size: { w: number; h: number }): Map<string, TimeOrderPosition> {
  const yearOf = (n: AtlasNode) => {
    const y = yearsById.get(n.id)
    return y == null ? null : Math.floor(y)
  }

  // Position within the year column. A reference list clusters hard into the last two or three
  // years, so a column is where the crowding is - by year alone those nodes share one x and stack
  // into a vertical pile. The month spreads them across the column instead, which is real
  // information rather than jitter. Nodes with no month sit at the centre.
  const monthOffset = (n: AtlasNode, step: number) => {
    const month = n.month
    if (typeof month !== "number" || month < 1 || month > 12) return 0
    return ((month - 6.5) / 12) * step * MONTH_SPREAD
  }

  // x: one column per distinct year present. Columns are NOT equal width - a year is given room
  // in proportion to how many references it holds (sqrt, so a 130-paper year is wider than a
  // 2-paper one without being 65 times wider). Equal widths looked right until a survey arrived:
  // 130 references in 2023 and 81 in 2024 against a 45px column left the sideways relaxation
  // nowhere to go, and 25 nodes were pushed a FULL COLUMN OR MORE out of their own year - a 2024
  // paper sitting at the 1975 end. Widening the busy years is what keeps the spill inside them.
  const years = [...new Set(nodes.map(yearOf).filter((y): y is number => y != null))].sort((p, q) => p - q)
  const columnOf = new Map(years.map((y, index) => [y, index]))
  const gaps = Math.max(1, years.length - 1)

  const perYear = new Map<number, number>()
  for (const n of nodes) {
    const year = yearOf(n)
    if (year != null) perYear.set(year, (perYear.get(year) ?? 0) + 1)
  }

  // y: global rank by citation count, most cited at the top. Ties break on id so the layout is
  // stable between renders rather than reshuffling equal-count nodes.
  const ranked = [...nodes].sort((p, q) => {
    const diff = citationScore(q) - citationScore(p)
    return diff !== 0 ? diff : p.id.localeCompare(q.id)
  })
  // Vertical room starts at the canvas and grows only if the overlaps demand it. It used to
  // reserve a row per node in the densest column, which made sense while every column was the
  // same narrow width - a 130-reference year then had nowhere but down, and the field came out
  // 3354px tall. With columns sized to their year that reservation is obsolete: measured on the
  // survey, the aspect-filling 982px already clears every overlap at full node size.
  const spanY = (size.h || 600) * FILL

  // Total width is the CANVAS, not a step times the number of years. Deriving it from the gap
  // count is backwards once columns are weighted: filtering to 2020+ leaves six years, which under
  // the old rule gave a 469px-wide field to hold 411 references and forced the height to 3509px.
  // How much room the map needs is a function of how many nodes there are, not how many distinct
  // years they happen to fall in.
  const spanX = (size.w || 900) * FILL
  const stepX = spanX / gaps

  // Split that width across the years by sqrt of how many references each holds, so a busy year
  // gets room to spread inside itself and a sparse one stays narrow. That is also what keeps the
  // axis compact where nothing was published, without stretching where plenty was.
  const weights = years.map((y) => Math.sqrt(perYear.get(y) ?? 1))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1
  const columnW = weights.map((w) => Math.max(MIN_COLUMN_W, (spanX * w) / totalWeight))
  const columnCentre: number[] = []
  let cursor = -columnW.reduce((sum, w) => sum + w, 0) / 2
  for (const w of columnW) { columnCentre.push(cursor + w / 2); cursor += w }
  const widthOfColumn = (index: number) => columnW[index] ?? stepX
  const xOfColumn = (index: number) => columnCentre[index] ?? -spanX / 2 + index * stepX
  const homeX = new Map<string, number>()
  for (const n of nodes) {
    const year = yearOf(n)
    const column = year == null ? null : columnOf.get(year)
    const width = column == null ? stepX : widthOfColumn(column)
    homeX.set(n.id, column == null
      ? xOfColumn(0) - widthOfColumn(0) / 2 - stepX
      : xOfColumn(column) + (n.type === "owned" ? OWNED_COLUMN_OFFSET * width : monthOffset(n, width)))
  }

  // One relaxation at a given field height. y comes from the citation ranking and is never moved,
  // so the top-to-bottom order is exact; every overlap is paid for in x. A year column is an
  // ordinal bucket rather than a measurement, so a node sitting off its column centre still reads
  // correctly - the axis only has to say earlier-then-later, the way y only says more-cited-then-
  // less.
  // The x range each node may occupy: its own column, no wider.
  const boundOf = new Map<string, { min: number; max: number }>()
  for (const n of nodes) {
    const year = yearOf(n)
    const column = year == null ? null : columnOf.get(year)
    const centre = column == null ? (homeX.get(n.id) ?? 0) : xOfColumn(column)
    const width = column == null ? stepX : widthOfColumn(column)
    boundOf.set(n.id, { min: centre - width * MAX_DRIFT, max: centre + width * MAX_DRIFT })
  }

  const relax = (trialSpanY: number) => {
    const yOf = new Map<string, number>()
    ranked.forEach((n, index) => {
      const t = ranked.length > 1 ? index / (ranked.length - 1) : 0.5
      yOf.set(n.id, -trialSpanY / 2 + t * trialSpanY)
    })
    const items = nodes.map((n) => ({ id: n.id, r: tierRadius(n), y: yOf.get(n.id) ?? 0, x: homeX.get(n.id) ?? 0 }))
    // Sorted by y so the inner loop can stop early: once a later node is further away vertically
    // than any pair could need, nothing after it can overlap either.
    items.sort((a, b) => a.y - b.y)
    const maxR = Math.max(0, ...items.map((i) => i.r))

    const separate = (pullHome: number) => {
      let moved = 0
      for (let i = 0; i < items.length; i++) {
        const a = items[i]
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j]
          const dy = b.y - a.y
          if (dy >= a.r + maxR + NODE_GAP) break
          const need = a.r + b.r + NODE_GAP
          if (dy >= need) continue
          const minDx = Math.sqrt(need * need - dy * dy)
          const dx = b.x - a.x
          const gap = Math.abs(dx)
          if (gap >= minDx) continue
          const push = (minDx - gap) / 2 + 0.5
          const dir = dx === 0 ? (a.id < b.id ? -1 : 1) : Math.sign(dx)
          a.x -= dir * push
          b.x += dir * push
          moved += 1
        }
      }
      if (pullHome > 0) {
        for (const item of items) item.x += ((homeX.get(item.id) ?? item.x) - item.x) * pullHome
      }
      // Hard bound: a node may spread within its own year and never past it. Without this the
      // separation pass silently relocates crowded references into neighbouring years, which
      // reads as data rather than as layout.
      for (const item of items) {
        const bound = boundOf.get(item.id)
        if (!bound) continue
        item.x = Math.min(bound.max, Math.max(bound.min, item.x))
      }
      return moved
    }

    // Settle with a weak pull back toward the year column, then pure-separation passes so the pull
    // cannot leave a residual overlap behind.
    for (let pass = 0; pass < 90; pass++) if (separate(0.03) === 0) break
    for (let pass = 0; pass < 40; pass++) if (separate(0) === 0) break

    const xs = items.map((i) => i.x)
    const width = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0
    return { yOf, items, width, spanY: trialSpanY }
  }

  // Pick the field height. Sideways room is now bounded by the columns, so a crowded year can no
  // longer be relieved by spreading into its neighbours - it has to be relieved by height. Start
  // at the height that would fill the canvas and grow only as far as needed to clear the
  // overlaps, capped so a 300-reference survey cannot demand an endless canvas. Whatever is left
  // over is absorbed by shrinking the nodes.
  const overlapCount = (items: { r: number; x: number; y: number }[]) => {
    let bad = 0
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) bad += 1
      }
    }
    return bad
  }

  const targetAspect = (size.w || 900) / (size.h || 600)
  const usedWidth = columnW.reduce((sum, w) => sum + w, 0)
  const baseSpanY = Math.max(spanY, usedWidth / targetAspect)
  // Growth stops at roughly twice the canvas. Past that the field is taller than it is useful and
  // the fit zooms it down anyway; the remaining crowding is better paid for by shrinking the
  // nodes, which fitNodeScale does next. The unfiltered 562-reference view is the case that hits
  // this - at 3.4x it was 3912px tall for an aspect of 0.42.
  const GROWTH = [1, 1.25, 1.6, 2.1]
  let layout = relax(baseSpanY)
  for (const factor of GROWTH.slice(1)) {
    if (overlapCount(layout.items) === 0) break
    layout = relax(baseSpanY * factor)
  }

  const yById = layout.yOf
  const relaxedX = new Map(layout.items.map((item) => [item.id, item.x]))

  const positionById = new Map<string, TimeOrderPosition>()
  for (const n of nodes) {
    positionById.set(n.id, {
      x: relaxedX.get(n.id) ?? homeX.get(n.id) ?? 0,
      y: yById.get(n.id) ?? 0,
    })
  }
  return positionById
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
  scaleByCitations = true,
  emphasis = null,
  selectedId = null,
  layoutKey = "",
  onSelectNode,
  onClearSelection,
}: {
  data: { nodes: AtlasNode[]; edges: AtlasEdge[] }
  layout?: GraphLayout
  colorBy?: ColorBy
  showHulls?: boolean
  scaleByCitations?: boolean
  emphasis?: Emphasis
  selectedId?: string | null
  layoutKey?: string // changes only when the underlying owned scope changes -> fresh layout
  onSelectNode: (node: AtlasNode) => void
  onClearSelection?: () => void
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

  const timelineYearMap = useMemo(() => timelineYears(data.nodes), [data.nodes])
  // Every node stays visible in either layout; an undated one is parked in its own band rather
  // than filtered out; computeTimeOrder gives it a column of its own.
  const visibleNodes = data.nodes
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const timeOrder = useMemo(
    () => (layout === "timeline" ? computeTimeOrder(visibleNodes, timelineYearMap, size) : null),
    [layout, timelineYearMap, visibleNodes, size],
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
    const shrink = timeOrder ? fitNodeScale(visibleNodes, timeOrder) : 1
    const citationValues = scaleByCitations ? citationScale(visibleNodes, shrink) : null
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
        // BOTH axes are pinned. Leaving y to a force target was why overlaps survived the spacing
        // pass: that pass guarantees clearance at the computed positions, but charge, link and
        // centre forces then pulled nodes off them, so the guarantee described a layout nobody
        // saw. There is nothing left for the simulation to discover here - x is a year ranking and
        // y is a citation ranking, both computed - so pinning makes the drawing match the maths
        // and stops the map drifting while you look at it.
        node.x = timePosition.x
        node.y = timePosition.y
        node.fx = timePosition.x
        node.fy = timePosition.y
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
    graph.d3Force?.("nodeCollision", collisionForce(0.58))
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
    // No timeOrderSpread force: y is pinned, so a force toward the same y would be a no-op.
  }, [layout, timeOrder])

  // One colour per selected paper, so an edge says which paper it belongs to and a shared
  // reference shows one edge in each colour. With a single paper there is nothing to tell apart,
  // so it keeps the plain owned colour rather than becoming arbitrarily green.
  const ownedColors = useMemo(() => {
    const owned = visibleNodes.filter((n) => n.type === "owned").map((n) => n.id)
    if (owned.length < 2) return new Map<string, string>()
    const clusters = palette().clusters
    return new Map(owned.map((id, index) => [id, clusters[index % clusters.length]]))
  }, [visibleNodes])

  // Which of your papers cite each external node. The degree is already on the node (citedBy),
  // but the ring draws one arc PER CITING PAPER in that paper's own colour, so it has to know
  // which ones. Sorted by the owned order the palette was assigned from, so the same pair of
  // papers always produces the same pair of arcs in the same place.
  const citingPapers = useMemo(() => {
    const owned = new Set(visibleNodes.filter((n) => n.type === "owned").map((n) => n.id))
    const by = new Map<string, string[]>()
    for (const e of data.edges) {
      if (!owned.has(e.source) || owned.has(e.target)) continue
      const list = by.get(e.target)
      if (list) { if (!list.includes(e.source)) list.push(e.source) } else by.set(e.target, [e.source])
    }
    return by
  }, [data.edges, visibleNodes])

  // Edges are drawn only for the selected node. A reference list is a star per paper, so drawing
  // every edge at once is a wall of lines that hides the structure it is meant to show; on click
  // the one paper or one reference you asked about is the only thing connected.
  const endpointIds = (link: RuntimeLink) => {
    const source = typeof link.source === "object" ? link.source?.id : link.source
    const target = typeof link.target === "object" ? link.target?.id : link.target
    return [source, target] as (string | undefined)[]
  }
  const isIncident = (link: RuntimeLink) => {
    if (!selectedId) return false
    return endpointIds(link).includes(selectedId)
  }
  const linkOwnerColor = (link: RuntimeLink) => {
    const [source, target] = endpointIds(link)
    return (source && ownedColors.get(source)) || (target && ownedColors.get(target)) || palette().cited
  }

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
          // Positions are not the user's to set. Both coordinates carry meaning - x is the year
          // ranking, y the citation ranking - so a dragged node is simply reporting something
          // untrue, and it would survive as a pinned fx/fy until the layout recomputed. Panning
          // and zooming stay; only moving a node is refused.
          enableNodeDrag={false}
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
            const base = nodeColorFor(n.__src, colorBy, ownedColors)
            return dimNode(n.id) ? withAlpha(base, 0.12) : base
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkColor={(l: any) => {
            if (!isIncident(l)) return "rgba(0,0,0,0)"
            const active = emphasis?.isActiveEdge ? emphasis.isActiveEdge(l.__e) : true
            if (!active) return withAlpha(palette().external, 0.06)
            return withAlpha(linkOwnerColor(l), 0.85)
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkWidth={(l: any) => (isIncident(l) ? 1.8 : 0)}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          linkDirectionalArrowLength={(l: any) => (isIncident(l) && l.__e?.direct ? 3.5 : 0)}
          linkDirectionalArrowRelPos={1}
          onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
            if (showHulls && colorBy === "cluster") drawHulls(ctx, globalScale, graphData.nodes)
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onNodeClick={(node: any) => onSelectNode(node.__src as AtlasNode)}
          // Edges follow the selection now, so clicking away has to be able to put them back.
          onBackgroundClick={() => onClearSelection?.()}
          nodeLabel={(node: { __src: AtlasNode }) => node.__src.label}
          // The hit area is exactly what is drawn: the dot, and out to the ring when the node
          // has one. A margin beyond that was worse than the aim it saved (2026-09-14) - the
          // cursor turned to a pointer over empty canvas all across the map, so the shape you
          // were about to click was a guess. A ringed node is the bigger target because it looks
          // bigger; nothing else grows.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D, scale: number) => {
            const src = node.__src as AtlasNode
            const ringed = src.type === "external" && (src.citedBy ?? 0) > 1
            const radius = Math.sqrt(node.val ?? 1) * NODE_REL_SIZE
              + (ringed ? (RING_OFFSET_PX + RING_STROKE_PX / 2) / Math.max(scale, 0.01) : 0)
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)
            ctx.fill()
          }}
          nodeCanvasObjectMode={() => "after"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
            const src = node.__src as AtlasNode
            const dim = dimNode(node.id)
            // A reference cited by more than one of your papers is the thing this map exists to
            // surface, and with edges hidden until you click there is otherwise nothing to see it
            // by. Ring it: grey fill plus a coloured outline stays distinct from a paper, which is
            // a solid colour fill.
            const degree = src.type === "external" ? (src.citedBy ?? 0) : 0
            if (degree > 1 && !dim) {
              // One ARC per citing paper rather than one solid ring (2026-09-14). The ring said
              // only "more than one paper cites this"; segmented, the same pixels say how many,
              // countable at a glance, and - while the selection is small enough for the edge
              // palette to stay distinguishable - which ones, without tracing edges across the
              // canvas. It costs no radius, so the collision spacing NODE_GAP was tuned for is
              // untouched.
              const radius = Math.sqrt(node.val ?? 1) * NODE_REL_SIZE + RING_OFFSET_PX / scale
              const arcs = Math.min(degree, MAX_RING_ARCS)
              const colors = ringColors(citingPapers.get(src.id), ownedColors, arcs)
              // The gap is a constant number of SCREEN pixels, so it neither closes up when you
              // zoom in nor eats the arc when you zoom out; capped because on a small node a
              // fixed pixel gap is most of the circumference, which would leave four dashes.
              const gap = Math.min(RING_GAP_PX / Math.max(radius * scale, 1), 0.5)
              // Past the cap the arcs stop counting, so weight carries "at least this many" -
              // the same 4+ bucket the Shared by filter offers.
              ctx.lineWidth = (degree > MAX_RING_ARCS ? RING_STROKE_PX + 1 : RING_STROKE_PX) / scale
              for (let i = 0; i < arcs; i += 1) {
                const from = (i * 2 * Math.PI) / arcs - Math.PI / 2 + gap / 2
                const to = ((i + 1) * 2 * Math.PI) / arcs - Math.PI / 2 - gap / 2
                ctx.beginPath()
                ctx.arc(node.x, node.y, radius, from, to)
                ctx.strokeStyle = colors[i]
                ctx.stroke()
              }
            }
            if (node.id === selectedId) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, 3 + 7 / scale, 0, 2 * Math.PI)
              ctx.strokeStyle = palette().citedStrong
              ctx.lineWidth = 1.5 / scale
              ctx.stroke()
            }
            // No labels on the canvas. Even limited to shared and selected nodes they collided into
            // an unreadable mess on a 500-node map, and a truncated title says little anyway. The
            // title is on hover (nodeLabel) and in full in the inspector on click.
          }}
        />
      ) : null}
    </div>
  )
}
