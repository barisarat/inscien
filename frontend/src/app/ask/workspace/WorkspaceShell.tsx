"use client"

import ZoteroNavigator from "@/components/navigation/ZoteroNavigator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import PdfViewerPanel from "../components/PdfViewerPanel"
import TopBar from "./TopBar"
import GraphMode from "./GraphMode"
import NarrateMode from "./NarrateMode"
import { useWorkspace } from "./WorkspaceProvider"

// The whole app shell: the Zotero library sidebar + the active mode (Map / Narrate) and a
// draggable PDF viewer panel inside the sidebar inset. No chat - InScien is two transformation modes.
export default function WorkspaceShell() {
  const { mode, setMode, pdfTabs, activePdfTabId, hasOpenPdf, selectPdfTab, closePdfTab, closePdfPanel } =
    useWorkspace()

  return (
    <SidebarProvider>
      <ZoteroNavigator />
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
