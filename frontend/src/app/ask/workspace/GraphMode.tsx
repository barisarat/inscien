"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import {
  fetchDiscoveryGraph,
  getGraphFetch,
  graphFetchStatus,
  startGraphFetch,
  type DiscoveryGraph,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import GraphView, { type GraphLayout } from "../components/GraphView"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

type Phase = "need-more" | "checking" | "confirm" | "fetching" | "ready" | "error"

const DISCLOSURE =
  "The citation map uses OpenAlex (open scholarly data). It sends each selected paper's DOI " +
  "to fetch its public references — nothing else leaves your machine. This is the only feature " +
  "that needs internet."

export default function GraphMode() {
  const { selectedKeys } = useZoteroSelection()
  const { openPdf } = useWorkspace()

  const itemKeys = Array.from(selectedKeys).sort()
  const keysKey = itemKeys.join(",")

  const [phase, setPhase] = useState<Phase>("checking")
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [noDoiCount, setNoDoiCount] = useState(0)
  const [data, setData] = useState<DiscoveryGraph | null>(null)
  const [progress, setProgress] = useState<{ detail?: string; progress?: number }>({})
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<GraphLayout>("network")
  const token = useRef(0)

  const render = useCallback(async (keys: string[], t: number) => {
    const graph = await fetchDiscoveryGraph(keys)
    if (t !== token.current) return
    setData(graph)
    setPhase("ready")
  }, [])

  // Check coverage whenever the selection changes: all mapped → render directly;
  // otherwise offer the fetch confirmation.
  useEffect(() => {
    const t = ++token.current
    setError(null)
    setData(null)
    if (itemKeys.length === 0) {
      setPhase("need-more")
      return
    }
    setPhase("checking")
    void (async () => {
      try {
        const status = await graphFetchStatus(itemKeys)
        if (t !== token.current) return
        setUnmapped(status.unmapped)
        setNoDoiCount(status.noDoi.length)
        if (status.unmapped.length === 0) {
          await render(itemKeys, t)
        } else {
          setPhase("confirm")
        }
      } catch (e) {
        if (t !== token.current) return
        setError(String(e))
        setPhase("error")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey])

  const build = useCallback(async () => {
    const t = ++token.current
    setPhase("fetching")
    setProgress({})
    setError(null)
    try {
      const { jobId } = await startGraphFetch(unmapped)
      for (;;) {
        if (t !== token.current) return
        const s = await getGraphFetch(jobId)
        if (t !== token.current) return
        setProgress({ detail: s.detail, progress: s.progress })
        if (s.status === "done") {
          await render(itemKeys, t)
          return
        }
        if (s.status === "error") {
          setError(s.error || "Fetch failed.")
          setPhase("error")
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    } catch (e) {
      if (t !== token.current) return
      setError(String(e))
      setPhase("error")
    }
  }, [unmapped, itemKeys, render])

  // --- Rendered map ---------------------------------------------------------
  if (phase === "ready" && data) {
    const owned = data.nodes.filter((n) => n.type === "owned").length
    const external = data.nodes.length - owned
    if (owned === 0) {
      return (
        <div className={styles.placeholder}>
          <h2 className={styles.placeholderTitle}>Nothing to map</h2>
          <p className={styles.placeholderHint}>
            None of the selected papers have a DOI in OpenAlex, so there are no references to map.
          </p>
          <p className={styles.placeholderMeta}>{DISCLOSURE}</p>
        </div>
      )
    }
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>
            Discovery map · {owned} owned · {external} referenced
            {data.noDoi.length > 0 ? ` · no DOI ${data.noDoi.length}` : ""}
          </span>
          <div className={compareStyles.scopeChips}>
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
          </div>
        </div>
        <div className={styles.graphBody}>
          <GraphView
            key={layout}
            data={data}
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
      </div>
    )
  }

  // --- Empty selection ------------------------------------------------------
  if (phase === "need-more") {
    return (
      <div className={styles.placeholder}>
        <h2 className={styles.placeholderTitle}>Discovery map</h2>
        <p className={styles.placeholderHint}>
          Select papers in the library to map their literature — your papers plus the works they
          cite, drawn from OpenAlex.
        </p>
        <p className={styles.placeholderMeta}>{DISCLOSURE}</p>
      </div>
    )
  }

  // --- Checking coverage ----------------------------------------------------
  if (phase === "checking") {
    return (
      <div className={styles.placeholder}>
        <p className={styles.placeholderHint}>
          <Loader2 size={14} className={styles.spin} /> Checking coverage…
        </p>
      </div>
    )
  }

  // --- Confirm / fetch / error (centered card) ------------------------------
  return (
    <div className={styles.modeCentered}>
      <div className={compareStyles.confirm}>
        <div className={compareStyles.confirmHead}>
          <span className={compareStyles.confirmTitle}>
            Fetch references for {unmapped.length} paper{unmapped.length === 1 ? "" : "s"} from OpenAlex
          </span>
        </div>
        <div className={compareStyles.confirmLabel}>{DISCLOSURE}</div>
        {noDoiCount > 0 ? (
          <div className={compareStyles.confirmLabel}>
            {noDoiCount} selected paper{noDoiCount === 1 ? " has" : "s have"} no DOI and won&apos;t be
            mapped.
          </div>
        ) : null}

        {phase === "fetching" ? (
          <div className={styles.runProgress}>
            <div className={styles.runStage}>
              <Loader2 size={13} className={styles.spin} /> {progress.detail || "Fetching references…"}
            </div>
            <div className={styles.bar}>
              <div className={styles.barFill} style={{ width: `${progress.progress ?? 5}%` }} />
            </div>
          </div>
        ) : phase === "error" ? (
          <div className={styles.errorBox}>
            {error || "Something went wrong."}
            <button type="button" className={styles.linkBtn} onClick={build}>
              Retry
            </button>
          </div>
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
