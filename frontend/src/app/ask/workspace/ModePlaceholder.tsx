"use client"

import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { type WorkspaceMode } from "./ActionBar"
import styles from "./Workspace.module.css"

const COPY: Record<Exclude<WorkspaceMode, "ask">, { title: string; hint: string }> = {
  compare: { title: "Compare", hint: "Select 2 or more papers in the library to build a grounded comparison table." },
  write: { title: "Write", hint: "Draft a cited literature review over your selected papers." },
  narrate: { title: "Narrate", hint: "Select one paper to generate an audio narration." },
  graph: { title: "Graph", hint: "View the citation map of your library." },
}

export default function ModePlaceholder({ mode }: { mode: Exclude<WorkspaceMode, "ask"> }) {
  const { selectedKeys } = useZoteroSelection()
  const { title, hint } = COPY[mode]
  return (
    <div className={styles.placeholder}>
      <h2 className={styles.placeholderTitle}>{title}</h2>
      <p className={styles.placeholderHint}>{hint}</p>
      <p className={styles.placeholderMeta}>
        {selectedKeys.size} paper{selectedKeys.size === 1 ? "" : "s"} selected · this mode lands in an upcoming build.
      </p>
    </div>
  )
}
