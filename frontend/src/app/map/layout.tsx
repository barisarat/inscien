import { Suspense } from "react"

import PdfFromUrl from "./workspace/PdfFromUrl"
import WorkspaceShell from "./workspace/WorkspaceShell"
import { ZoteroSelectionProvider } from "@/lib/ZoteroSelectionProvider"
import { WorkspaceProvider } from "./workspace/WorkspaceProvider"

export const metadata = {
  title: "InScien",
  description: "A map of your Zotero papers and what they cite.",
}

// The shell the Map and the search results share: the library sidebar, the main area (the
// page) and the PDF panel; `?pdf=<itemKey>` opens a PDF in that panel on arrival. Kept in the
// layout so moving between /map and /map/search keeps the sidebar selection and the open PDF
// tabs.
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <ZoteroSelectionProvider>
      <WorkspaceProvider>
        <Suspense>
          <PdfFromUrl />
        </Suspense>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceProvider>
    </ZoteroSelectionProvider>
  )
}
