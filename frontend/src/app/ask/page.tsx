import WorkspaceShell from "./workspace/WorkspaceShell"
import { ZoteroSelectionProvider } from "@/lib/ZoteroSelectionProvider"
import { WorkspaceProvider } from "./workspace/WorkspaceProvider"

export const metadata = {
  title: "InScien",
  description: "A local atlas of your Zotero library — map your papers by content and citations, and narrate them.",
}

export default function AskPage() {
  return (
    <ZoteroSelectionProvider>
      <WorkspaceProvider>
        <WorkspaceShell />
      </WorkspaceProvider>
    </ZoteroSelectionProvider>
  )
}
