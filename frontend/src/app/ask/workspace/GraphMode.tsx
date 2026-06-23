"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  fetchCitingGraph,
  fetchDiscoveryGraph,
  fetchIndexedKeys,
  fetchSimilarityMap,
  fetchZoteroCollections,
  fetchZoteroIndexableKeys,
  getGraphFetch,
  graphFetchStatus,
  startCitingFetch,
  startGraphFetch,
  type DiscoveryGraph,
  type SimilarityMap,
  type ZoteroCollection,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob, JobProgress, JobError } from "./skillJob"
import GraphView, { type GraphLayout } from "../components/GraphView"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

type Lens = "similarity" | "citations"
type Facet = "references" | "citedby" | "gaps"
type Phase = "need-more" | "checking" | "confirm" | "fetching" | "ready" | "error"

const GAP_MIN = 2 // a reference cited by ≥2 of your selected papers is a "gap" worth surfacing

const DISCLOSURE =
  "The citation map uses OpenAlex (open scholarly data). It sends each selected paper's DOI " +
  "to fetch its public references/citers — nothing else leaves your machine. This is the only " +
  "feature that needs internet."

function Chips<T extends string>({ value, options, onChange }: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className={compareStyles.scopeChips}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`${compareStyles.scopeChip} ${value === o.v ? compareStyles.scopeChipOn : ""}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

type Scope = { kind: "selection" } | { kind: "library" } | { kind: "collection"; id: number; name: string }

export default function GraphMode() {
  const { selectedKeys } = useZoteroSelection()
  const { openPdf } = useWorkspace()

  const [scope, setScope] = useState<Scope>({ kind: "selection" })
  const [scopeKeys, setScopeKeys] = useState<string[]>([])
  const [collections, setCollections] = useState<{ id: number; name: string; depth: number }[]>([])

  // Flat list of collections (with depth) for the scope dropdown.
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
        /* navigator shows the real error; scope dropdown just stays empty */
      }
    })()
  }, [])

  // Resolve the chosen scope → the item keys the map runs over.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (scope.kind === "selection") {
        setScopeKeys(Array.from(selectedKeys).sort())
        return
      }
      try {
        const res = scope.kind === "library"
          ? await fetchIndexedKeys()
          : await fetchZoteroIndexableKeys(scope.id)
        if (!cancelled) setScopeKeys([...res.itemKeys].sort())
      } catch {
        if (!cancelled) setScopeKeys([])
      }
    })()
    return () => { cancelled = true }
  }, [scope, selectedKeys])

  const itemKeys = scopeKeys
  const keysKey = itemKeys.join(",")

  const [lens, setLens] = useState<Lens>("similarity")
  const [facet, setFacet] = useState<Facet>("references")
  const [phase, setPhase] = useState<Phase>("checking")
  const [simData, setSimData] = useState<SimilarityMap | null>(null)
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [noDoiCount, setNoDoiCount] = useState(0)
  const [data, setData] = useState<DiscoveryGraph | null>(null)
  const [layout, setLayout] = useState<GraphLayout>("network")
  const { progress, error, setError, newRun, isStale, track } = useSkillJob()

  // Build + show whichever citation graph the facet calls for (assumes items are mapped).
  const showCitations = useCallback(async (keys: string[], f: Facet, t: number) => {
    if (f === "citedby") {
      setPhase("fetching")
      const { jobId } = await startCitingFetch(keys) // idempotent: instant if already cached
      await track(t, jobId, getGraphFetch, {
        onDone: async () => {
          const g = await fetchCitingGraph(keys)
          if (isStale(t)) return
          setData(g)
          setPhase("ready")
        },
        onError: () => setPhase("error"),
        fallbackError: "Fetch failed.",
      })
      return
    }
    const g = await fetchDiscoveryGraph(keys) // references + gaps share this
    if (isStale(t)) return
    setData(g)
    setPhase("ready")
  }, [track, isStale])

  // Re-run on selection / lens / facet change.
  useEffect(() => {
    const t = newRun()
    setData(null)
    setSimData(null)
    if (itemKeys.length === 0) {
      setPhase("need-more")
      return
    }
    setPhase("checking")
    void (async () => {
      try {
        if (lens === "similarity") {
          const map = await fetchSimilarityMap(itemKeys)
          if (isStale(t)) return
          setSimData(map)
          setPhase("ready")
          return
        }
        const status = await graphFetchStatus(itemKeys)
        if (isStale(t)) return
        setUnmapped(status.unmapped)
        setNoDoiCount(status.noDoi.length)
        if (status.unmapped.length > 0) setPhase("confirm")
        else await showCitations(itemKeys, facet, t)
      } catch (e) {
        if (isStale(t)) return
        setError(String(e))
        setPhase("error")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey, lens, facet])

  // Confirm action: map (and for cited-by, fetch citers) then render.
  const build = useCallback(async () => {
    const t = newRun()
    setPhase("fetching")
    try {
      const { jobId } = facet === "citedby" ? await startCitingFetch(itemKeys) : await startGraphFetch(unmapped)
      await track(t, jobId, getGraphFetch, {
        onDone: async () => {
          const g = facet === "citedby" ? await fetchCitingGraph(itemKeys) : await fetchDiscoveryGraph(itemKeys)
          if (isStale(t)) return
          setData(g)
          setPhase("ready")
        },
        onError: () => setPhase("error"),
        fallbackError: "Fetch failed.",
      })
    } catch (e) {
      if (isStale(t)) return
      setError(String(e))
      setPhase("error")
    }
  }, [facet, unmapped, itemKeys, newRun, isStale, track, setError])

  // --- Similarity adaptation ------------------------------------------------
  const simGraph = useMemo(
    () =>
      simData
        ? {
            nodes: simData.nodes.map((n) => ({ id: n.id, label: n.label, type: "owned" as const, collection: n.collection })),
            edges: simData.edges.map((e) => ({ from: e.source, to: e.target })),
          }
        : null,
    [simData],
  )
  const themes = useMemo(
    () => Array.from(new Set((simData?.nodes ?? []).map((n) => n.clusterLabel).filter(Boolean))) as string[],
    [simData],
  )

  // Gaps = owned + the influential references (cited by ≥ GAP_MIN of your papers).
  const citationData = useMemo(() => {
    if (!data) return null
    if (facet !== "gaps") return data
    const nodes = data.nodes.filter((n) => n.type === "owned" || (n.citedBy ?? 0) >= GAP_MIN)
    const keep = new Set(nodes.map((n) => n.id))
    return { ...data, nodes, edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) }
  }, [data, facet])

  const scopeControl = (
    <div className={compareStyles.scopeChips}>
      <button
        type="button"
        className={`${compareStyles.scopeChip} ${scope.kind === "selection" ? compareStyles.scopeChipOn : ""}`}
        onClick={() => setScope({ kind: "selection" })}
      >
        Selection
      </button>
      <button
        type="button"
        className={`${compareStyles.scopeChip} ${scope.kind === "library" ? compareStyles.scopeChipOn : ""}`}
        onClick={() => setScope({ kind: "library" })}
      >
        Library
      </button>
      <select
        className={compareStyles.scopeChip}
        value={scope.kind === "collection" ? String(scope.id) : ""}
        onChange={(e) => {
          const id = Number(e.target.value)
          const c = collections.find((x) => x.id === id)
          if (c) setScope({ kind: "collection", id, name: c.name })
        }}
      >
        <option value="">Collection…</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{`${" ".repeat(c.depth * 2)}${c.name}`}</option>
        ))}
      </select>
    </div>
  )

  const lensChips = <Chips<Lens> value={lens} options={[{ v: "similarity", label: "Similarity" }, { v: "citations", label: "Citations" }]} onChange={setLens} />
  const facetChips = (
    <Chips<Facet>
      value={facet}
      options={[{ v: "references", label: "References" }, { v: "citedby", label: "Cited-by" }, { v: "gaps", label: "Gaps" }]}
      onChange={setFacet}
    />
  )

  // --- Empty selection ------------------------------------------------------
  if (phase === "need-more") {
    return (
      <div className={styles.placeholder}>
        <h2 className={styles.placeholderTitle}>Map</h2>
        <p className={styles.placeholderHint}>
          Select papers in the library to map them — or choose a whole collection / your whole
          library below. Map by content similarity (themes) or by citations (OpenAlex).
        </p>
        {scopeControl}
      </div>
    )
  }

  // --- Checking / loading ---------------------------------------------------
  if (phase === "checking") {
    return (
      <div className={styles.placeholder}>
        <p className={styles.placeholderHint}>
          <Loader2 size={14} className={styles.spin} /> {lens === "similarity" ? "Building the map…" : "Checking coverage…"}
        </p>
      </div>
    )
  }

  // --- Similarity (ready) ---------------------------------------------------
  if (lens === "similarity" && phase === "ready" && simGraph) {
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>
            Similarity · {simGraph.nodes.length} papers
            {themes.length > 0 ? ` · ${themes.length} themes` : ""}
            {simData && simData.missing.length > 0 ? ` · ${simData.missing.length} not indexed` : ""}
          </span>
          <div className={compareStyles.scopeChips}>
            {scopeControl}
            {lensChips}
          </div>
        </div>
        {simGraph.nodes.length === 0 ? (
          <div className={styles.placeholder}>
            <p className={styles.placeholderHint}>
              The selected papers aren’t indexed yet — index them in the library first.
            </p>
          </div>
        ) : (
          <>
            {themes.length > 0 ? (
              <div className={compareStyles.confirmPapers}>
                {themes.map((t) => (
                  <span key={t} className={compareStyles.confirmPaper}>{t}</span>
                ))}
              </div>
            ) : null}
            <div className={styles.graphBody}>
              <GraphView data={simGraph} layout="network" onOpenNode={(n) => openPdf({ sourceId: n.id, title: n.title, page: 1 })} />
            </div>
          </>
        )}
      </div>
    )
  }

  // --- Citations (ready) ----------------------------------------------------
  if (lens === "citations" && phase === "ready" && citationData) {
    const owned = citationData.nodes.filter((n) => n.type === "owned").length
    const external = citationData.nodes.length - owned
    const noun = facet === "citedby" ? "citing" : facet === "gaps" ? "gaps" : "referenced"
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>
            Citations · {owned} owned · {external} {noun}
            {citationData.noDoi.length > 0 ? ` · no DOI ${citationData.noDoi.length}` : ""}
          </span>
          <div className={compareStyles.scopeChips}>
            {scopeControl}
            {facetChips}
            {(["network", "timeline"] as GraphLayout[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`${compareStyles.scopeChip} ${layout === l ? compareStyles.scopeChipOn : ""}`}
                onClick={() => setLayout(l)}
              >
                {l === "network" ? "Network" : "Timeline"}
              </button>
            ))}
            {lensChips}
          </div>
        </div>
        {external === 0 ? (
          <div className={styles.placeholder}>
            <p className={styles.placeholderHint}>
              {facet === "gaps"
                ? `No references are shared by ≥${GAP_MIN} of your selected papers.`
                : "No OpenAlex links found for the selected papers (they may lack DOIs)."}
            </p>
          </div>
        ) : (
          <div className={styles.graphBody}>
            <GraphView
              key={`${facet}-${layout}`}
              data={citationData}
              layout={layout}
              onOpenNode={(n) => {
                if (n.type === "external") {
                  if (n.doi) window.open(`https://doi.org/${n.doi}`, "_blank", "noopener,noreferrer")
                } else {
                  openPdf({ sourceId: n.id, title: n.title, page: 1 })
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  // --- Citations: confirm / fetch / error (centered card) -------------------
  return (
    <div className={styles.modeCentered}>
      <div className={compareStyles.confirm}>
        <div className={compareStyles.confirmHead}>
          <span className={compareStyles.confirmTitle}>
            Fetch from OpenAlex for {unmapped.length} paper{unmapped.length === 1 ? "" : "s"}
          </span>
          {lensChips}
        </div>
        <div className={compareStyles.confirmLabel}>{DISCLOSURE}</div>
        {noDoiCount > 0 ? (
          <div className={compareStyles.confirmLabel}>
            {noDoiCount} selected paper{noDoiCount === 1 ? " has" : "s have"} no DOI and won&apos;t be mapped.
          </div>
        ) : null}
        {phase === "fetching" ? (
          <JobProgress progress={progress} fallback="Fetching from OpenAlex…" />
        ) : phase === "error" ? (
          <JobError error={error} onRetry={build} />
        ) : (
          <div className={compareStyles.confirmActions}>
            <button type="button" className={compareStyles.runBtn} onClick={build}>
              Build map
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
