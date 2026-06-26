"use client"

import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent } from "react"

import ZoteroNavigator from "@/components/navigation/ZoteroNavigator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import PdfViewerPanel from "../components/PdfViewerPanel"
import TopBar from "./TopBar"
import GraphMode from "./GraphMode"
import NarrateMode from "./NarrateMode"
import { useWorkspace } from "./WorkspaceProvider"

const SIDEBAR_WIDTH_STORAGE_KEY = "inscien.sidebarWidth"
const DEFAULT_SIDEBAR_WIDTH = 256
const MIN_SIDEBAR_WIDTH = 224
const MAX_SIDEBAR_WIDTH = 420

// The whole app shell: the Zotero library sidebar + the active mode (Map / Narrate) and a
// draggable PDF viewer panel inside the sidebar inset. No chat - InScien is two transformation modes.
export default function WorkspaceShell() {
  const { mode, setMode, pdfTabs, activePdfTabId, hasOpenPdf, selectPdfTab, closePdfTab, closePdfPanel } =
    useWorkspace()
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    const parsed = stored ? Number(stored) : null
    if (parsed && Number.isFinite(parsed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed)))
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  const startSidebarResize = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()

    const startX = event.clientX
    const startWidth = sidebarWidth
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const resize = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth)))
    }

    const stop = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener("pointermove", resize)
      window.removeEventListener("pointerup", stop)
    }

    window.addEventListener("pointermove", resize)
    window.addEventListener("pointerup", stop)
  }, [sidebarWidth])

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <ZoteroNavigator onResizeStart={startSidebarResize} />
      <SidebarInset className="h-svh overflow-hidden">
        <TopBar mode={mode} onChange={setMode} />
        <ResizablePanelGroup className="min-h-0 flex-1">
          <ResizablePanel id="main" defaultSize={62} minSize={30} className="flex min-w-0 flex-col">
            {mode === "narrate" ? <NarrateMode /> : <GraphMode />}
          </ResizablePanel>
          {hasOpenPdf ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="pdf" defaultSize={38} minSize={25} className="flex min-w-0 flex-col">
                <PdfViewerPanel
                  tabs={pdfTabs}
                  activeTabId={activePdfTabId}
                  onSelectTab={selectPdfTab}
                  onCloseTab={closePdfTab}
                  onClosePanel={closePdfPanel}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </SidebarInset>
    </SidebarProvider>
  )
}
