"use client"

import { Columns3, ExternalLink, PanelRightClose, X } from "lucide-react"

import { type CompareCitation, type CompareResult, API_BASE } from "@/lib/api"
import ComparisonView from "./ComparisonView"
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
  comparison,
  comparisonActive,
  onSelectComparison,
  onCloseComparison,
  onOpenComparisonSource,
}: {
  tabs: PdfTab[]
  activeTabId: string | null
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onClosePanel: () => void
  comparison: CompareResult | null
  comparisonActive: boolean
  onSelectComparison: () => void
  onCloseComparison: () => void
  onOpenComparisonSource: (citation: CompareCitation) => void
}) {
  const showComparison = comparisonActive && comparison !== null
  const activePdf = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const fileUrl = activePdf
    ? `${API_BASE}/api/papers/${encodeURIComponent(activePdf.sourceId)}`
    : ""

  return (
    <aside className={styles.panel}>
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          {comparison ? (
            <button
              type="button"
              className={`${styles.tab} ${showComparison ? styles.tabActive : ""}`}
              onClick={onSelectComparison}
              title="Comparison"
            >
              <Columns3 size={13} strokeWidth={1.75} aria-hidden />
              <span className={styles.tabTitle}>Comparison</span>
              <span
                className={styles.tabClose}
                role="button"
                tabIndex={-1}
                aria-label="Close comparison"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseComparison()
                }}
              >
                <X size={13} strokeWidth={2} aria-hidden />
              </span>
            </button>
          ) : null}

          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${!showComparison && tab.id === activePdf?.id ? styles.tabActive : ""}`}
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
          {!showComparison && fileUrl ? (
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

      {showComparison && comparison ? (
        <ComparisonView data={comparison} onOpenCell={onOpenComparisonSource} />
      ) : activePdf ? (
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
