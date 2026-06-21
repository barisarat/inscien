"use client"

import Link from "next/link"
import { type ChatSessionSummary } from "@/lib/api"
import ActionBar, { type WorkspaceMode } from "./ActionBar"
import RecentsControl from "./RecentsControl"
import styles from "./TopBar.module.css"

type Props = {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
  brandWidth: number
  sessions: ChatSessionSummary[]
  activeSessionId: number | null
  onNew: () => void
  onRename: (id: number, currentTitle: string) => void
  onDelete: (id: number) => void
  onOpenHistory?: () => void
}

export default function TopBar({
  mode,
  onChange,
  brandWidth,
  sessions,
  activeSessionId,
  onNew,
  onRename,
  onDelete,
  onOpenHistory,
}: Props) {
  return (
    <header className={styles.bar}>
      <Link href="/ask" className={styles.brand} style={{ width: brandWidth }}>
        InScien
      </Link>
      <div className={styles.center}>
        <ActionBar mode={mode} onChange={onChange} />
      </div>
      <div className={styles.right}>
        <RecentsControl
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNew={onNew}
          onRename={onRename}
          onDelete={onDelete}
          onOpen={onOpenHistory}
        />
      </div>
    </header>
  )
}
