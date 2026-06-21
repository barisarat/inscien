"use client"

import { MessageSquare, Columns3, FileText, AudioLines, Network } from "lucide-react"
import styles from "./ActionBar.module.css"

export type WorkspaceMode = "ask" | "compare" | "write" | "narrate" | "graph"

const MODES: { mode: WorkspaceMode; label: string; Icon: typeof MessageSquare }[] = [
  { mode: "ask", label: "Ask", Icon: MessageSquare },
  { mode: "compare", label: "Compare", Icon: Columns3 },
  { mode: "write", label: "Write", Icon: FileText },
  { mode: "narrate", label: "Narrate", Icon: AudioLines },
  { mode: "graph", label: "Graph", Icon: Network },
]

type Props = {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}

export default function ActionBar({ mode, onChange }: Props) {
  return (
    <nav className={styles.bar} aria-label="Workspace mode">
      {MODES.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          type="button"
          className={`${styles.tab} ${mode === m ? styles.tabActive : ""}`}
          aria-current={mode === m ? "page" : undefined}
          onClick={() => onChange(m)}
        >
          <Icon size={15} />
          <span className={styles.tabLabel}>{label}</span>
        </button>
      ))}
    </nav>
  )
}
