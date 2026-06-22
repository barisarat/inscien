"use client"

import { X } from "lucide-react"

import { API_BASE } from "@/lib/api"
import PdfDocument from "../components/PdfDocument"
import styles from "./PdfDrawer.module.css"

// The shared in-app PDF viewer: a right drawer any mode opens via WorkspaceProvider.openPdf.
// Reuses PdfDocument, which scrolls to the page and highlights the cited passage.
export default function PdfDrawer({
  target,
  onClose,
}: {
  target: { sourceId: string; title: string; page: number; passage?: string }
  onClose: () => void
}) {
  return (
    <aside className={styles.drawer}>
      <header className={styles.head}>
        <span className={styles.title} title={target.title}>
          {target.title}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close PDF">
          <X size={16} />
        </button>
      </header>
      <div className={styles.body}>
        <PdfDocument
          fileUrl={`${API_BASE}/api/papers/${encodeURIComponent(target.sourceId)}`}
          targetPage={target.page}
          passage={target.passage}
        />
      </div>
    </aside>
  )
}
