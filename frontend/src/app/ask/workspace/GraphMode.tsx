"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { buildGraph, getGraph, getGraphBuild } from "@/lib/api"
import { useWorkspace } from "./WorkspaceProvider"
import GraphView, { type GraphData } from "../components/GraphView"
import compareStyles from "../components/Compare.module.css"
import styles from "./Workspace.module.css"

type Phase = "loading" | "empty" | "building" | "ready" | "error"

export default function GraphMode() {
  const { openPdf } = useWorkspace()
  const [phase, setPhase] = useState<Phase>("loading")
  const [data, setData] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const token = useRef(0)

  const load = useCallback(async () => {
    const t = ++token.current
    setPhase("loading")
    setError(null)
    try {
      const { graph } = await getGraph()
      if (t !== token.current) return
      if (graph && graph.nodes.length > 0) {
        setData(graph as GraphData)
        setPhase("ready")
      } else {
        setPhase("empty")
      }
    } catch (e) {
      if (t === token.current) {
        setError(String(e))
        setPhase("error")
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const build = useCallback(async () => {
    setPhase("building")
    setError(null)
    try {
      const { jobId } = await buildGraph()
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000))
        const s = await getGraphBuild(jobId)
        if (s.status === "done") {
          await load()
          return
        }
        if (s.status === "error") {
          setError(s.error || "Build failed.")
          setPhase("error")
          return
        }
      }
    } catch (e) {
      setError(String(e))
      setPhase("error")
    }
  }, [load])

  if (phase === "ready" && data) {
    return (
      <div className={styles.modeFill}>
        <div className={styles.modeHeader}>
          <span className={styles.modeHeaderTitle}>Citation map · {data.nodes.length} papers</span>
          <button type="button" className={styles.linkBtn} onClick={build}>
            Rebuild
          </button>
        </div>
        <div className={styles.graphBody}>
          <GraphView data={data} onOpenNode={(n) => openPdf({ sourceId: n.id, title: n.title, page: 1 })} />
        </div>
      </div>
    )
  }

  if (phase === "loading" || phase === "building") {
    return (
      <div className={styles.placeholder}>
        <p className={styles.placeholderHint}>
          <Loader2 size={14} className={styles.spin} /> {phase === "building" ? "Building citation map…" : "Loading…"}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.placeholder}>
      <h2 className={styles.placeholderTitle}>Citation map</h2>
      <p className={styles.placeholderHint}>
        {error
          ? error
          : "Build the citation graph of your library to see how your papers cite one another."}
      </p>
      <div className={compareStyles.confirmActions} style={{ justifyContent: "center", marginTop: 12 }}>
        <button type="button" className={compareStyles.runBtn} onClick={build}>
          Build citation graph
        </button>
      </div>
    </div>
  )
}
