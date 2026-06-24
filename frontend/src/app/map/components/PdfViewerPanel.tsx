"use client"

import { ExternalLink, PanelRightClose, X } from "lucide-react"

import { API_BASE } from "@/lib/api"
import { Button, buttonVariants } from "@/components/ui/button"
import PdfDocument from "./PdfDocument"

export type PdfTab = {
  id: string // = sourceId; one tab per document
  title: string
  sourceId: string
  targetPage: number
  passage?: string
  // Passage bbox [x0, y0, x1, y1] in PDF points (top-left origin) for coordinate highlight.
  bbox?: number[] | null
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
  const fileUrl = activePdf ? `${API_BASE}/api/papers/${encodeURIComponent(activePdf.sourceId)}` : ""

  return (
    <aside className="flex h-full min-h-0 flex-col border-l bg-card">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activePdf?.id
            return (
              <div
                key={tab.id}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <button type="button" className="max-w-[12rem] truncate" onClick={() => onSelectTab(tab.id)} title={tab.title}>
                  {tab.title}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {fileUrl ? (
            <a
              href={`${fileUrl}#page=${activePdf?.targetPage ?? 1}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in a browser tab"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <ExternalLink />
            </a>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={onClosePanel} aria-label="Close panel">
            <PanelRightClose />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {activePdf ? (
          <PdfDocument
            key={activePdf.id}
            fileUrl={fileUrl}
            targetPage={activePdf.targetPage}
            passage={activePdf.passage}
            bbox={activePdf.bbox}
          />
        ) : null}
      </div>
    </aside>
  )
}
