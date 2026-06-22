"use client"

import { ExternalLink, PanelRightClose, X } from "lucide-react"

import { API_BASE } from "@/lib/api"
import PdfDocument from "./PdfDocument"
import styles from "./PdfViewerPanel.module.css"


export type PdfTab = {
  id: string // = sourceId; one tab per document
  title: string
  sourceId: string
  targetPage: number
  passage?: string
}

export default function PdfViewerPanel({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onClosePanel,
}: {
  tabs: PdfTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onClosePanel: () => void
}) {
  const activePdf = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const fileUrl = activePdf
    ? `${API_BASE}/api/papers/${encodeURIComponent(activePdf.sourceId)}`
    : ""

  return (
    <aside className={styles.panel}>
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${tab.id === activePdf?.id ? styles.tabActive : ""}`}
              onClick={() => onSelectTab(tab.id)}
              title={tab.title}
            >
              <span className={styles.tabTitle}>{tab.title}</span>
              <span
                className={styles.tabClose}
                role="button"
                tabIndex={-1}
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <X size={13} strokeWidth={2} aria-hidden />
              </span>
            </button>
          ))}
        </div>
        <div className={styles.panelActions}>
          {fileUrl ? (
            <a
              className={styles.panelAction}
              href={`${fileUrl}#page=${activePdf?.targetPage ?? 1}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a browser tab"
              aria-label="Open in a browser tab"
            >
              <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
            </a>
          ) : null}
          <button
            type="button"
            className={styles.panelAction}
            onClick={onClosePanel}
            title="Close panel"
            aria-label="Close panel"
          >
            <PanelRightClose size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>

      {activePdf ? (
        <PdfDocument
          key={activePdf.id}
          fileUrl={fileUrl}
          targetPage={activePdf.targetPage}
          passage={activePdf.passage}
        />
      ) : null}
    </aside>
  )
}
