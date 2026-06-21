import AskClient from "./components/AskClient"
import { ZoteroSelectionProvider } from "@/lib/ZoteroSelectionProvider"

export const metadata = {
  title: "InScien",
  description: "Ask your own research papers and get answers with page-precise, verifiable citations.",
}

export default function AskPage() {
  return (
    <ZoteroSelectionProvider>
      <AskClient />
    </ZoteroSelectionProvider>
  )
}
