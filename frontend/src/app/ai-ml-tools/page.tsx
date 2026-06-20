import ListingPage from "@/components/listings/ListingPage"
import { getToolCount, getToolGroups } from "./data/registry"

export const metadata = {
  title: "AI/ML Tools | FinanceLab",
  description:
    "Search tools by where they fit in applied AI/ML workflows — models, retrieval, evals, serving, automation, monitoring, and more.",
}

export default function AiMlToolsPage() {
  const groups = getToolGroups()
  const toolCount = getToolCount()

  return (
    <ListingPage
      title="AI/ML Tools"
      desc={`Search ${toolCount} tools by where they fit in applied AI/ML workflows — models, retrieval, evals, serving, automation, monitoring, and more.`}
      sidebarTitle="AI/ML Tools"
      sidebarBrandHref="/ai-ml-tools"
      groups={groups}
      searchPlaceholder="Filter tools"
    />
  )
}
