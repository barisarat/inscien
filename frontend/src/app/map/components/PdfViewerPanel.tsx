"use client"

import { ExternalLink, PanelRightClose, X } from "lucide-react"

import { API_BASE } from "@/lib/api"
import { Button, buttonVariants } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
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
      <div className="flex h-13 shrink-0 items-center gap-1.5 border-b px-3">
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const active = tab.id === activePdf?.id
            return (
              <div key={tab.id} className="flex shrink-0 items-center gap-0.5">
                <Toggle
                  size="sm"
                  variant="segment"
                  pressed={active}
                  onPressedChange={(pressed) => {
                    if (pressed) onSelectTab(tab.id)
                  }}
                  title={tab.title}
                >
                  <span className="max-w-[12rem] truncate">{tab.title}</span>
                </Toggle>
                <Button
                  variant="ghost"
                  size="icon-xs"
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
