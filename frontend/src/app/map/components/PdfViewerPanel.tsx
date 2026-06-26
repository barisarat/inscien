"use client"

import { ExternalLink, PanelRightClose, X } from "lucide-react"

import { API_BASE } from "@/lib/api"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
      <div className="flex h-13 shrink-0 items-center gap-2 border-b" style={{ paddingLeft: "1.5rem", paddingRight: "1rem" }}>
        <div className="flex flex-1 items-center gap-2 overflow-x-auto py-2" role="tablist">
          {tabs.map((tab) => {
            const active = tab.id === activePdf?.id
            return (
              <div
                key={tab.id}
                className={`flex h-8 min-w-0 max-w-[14rem] shrink-0 items-center gap-2 rounded-lg border !pl-4 !pr-2 text-xs transition-colors ${
                  active
                    ? "border-border bg-muted text-foreground"
                    : "border-border/70 bg-card text-foreground hover:border-border hover:bg-muted"
                }`}
                role="tab"
                aria-selected={active}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => onSelectTab(tab.id)}
                  title={tab.title}
                >
                  {tab.title}
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 shrink-0"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <X />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {fileUrl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={`${fileUrl}#page=${activePdf?.targetPage ?? 1}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in a browser tab"
                    className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  >
                    <ExternalLink />
                  </a>
                }
              />
              <TooltipContent>Open in a browser tab</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon-sm" onClick={onClosePanel} aria-label="Close panel">
                  <PanelRightClose />
                </Button>
              }
            />
            <TooltipContent>Close panel</TooltipContent>
          </Tooltip>
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
