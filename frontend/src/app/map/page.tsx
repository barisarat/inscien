import WorkspaceShell from "./workspace/WorkspaceShell"
import { ZoteroSelectionProvider } from "@/lib/ZoteroSelectionProvider"
import { WorkspaceProvider } from "./workspace/WorkspaceProvider"

export const metadata = {
  title: "InScien",
  description: "A map of your Zotero papers and what they cite.",
}

export default function MapPage() {
  return (
    <ZoteroSelectionProvider>
      <WorkspaceProvider>
        <WorkspaceShell />
      </WorkspaceProvider>
    </ZoteroSelectionProvider>
  )
}
