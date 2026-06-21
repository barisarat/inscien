import AskClient from "./components/AskClient"
import { ZoteroSelectionProvider } from "@/lib/ZoteroSelectionProvider"
import { WorkspaceProvider } from "./workspace/WorkspaceProvider"

export const metadata = {
  title: "InScien",
  description: "Ask your own research papers and get answers with page-precise, verifiable citations.",
}

export default function AskPage() {
  return (
    <ZoteroSelectionProvider>
      <WorkspaceProvider>
        <AskClient />
      </WorkspaceProvider>
    </ZoteroSelectionProvider>
  )
}
