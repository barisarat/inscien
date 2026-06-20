import ListingPage from "@/components/listings/ListingPage"
import { getDocsListingGroups, getDocsSection } from "../data/registry"

export const metadata = {
  title: "Dev Docs | FinanceLab",
  description: "Repeatable development, Git, Docker, server, deployment, cloud, and editor workflows.",
}

export default function DevDocsPage() {
  const section = getDocsSection("dev")
  const groups = getDocsListingGroups("dev")

  return (
    <ListingPage
      title={section?.title ?? "Dev Docs"}
      desc={section?.desc ?? ""}
      sidebarTitle={section?.sidebarTitle ?? "Dev Docs"}
      groups={groups}
      searchPlaceholder={section?.searchPlaceholder ?? "Search dev docs..."}
    />
  )
}