import ListingPage from "@/components/listings/ListingPage"
import { getDocsListingGroups, getDocsSection } from "../data/registry"

export const metadata = {
  title: "ML Docs | FinanceLab",
  description: "Practical notes for notebooks, local AI workflows, RAG, and machine learning development.",
}

export default function MlDocsPage() {
  const section = getDocsSection("ml")
  const groups = getDocsListingGroups("ml")

  return (
    <ListingPage
      title={section?.title ?? "ML Docs"}
      desc={section?.desc ?? ""}
      sidebarTitle={section?.sidebarTitle ?? "ML Docs"}
      groups={groups}
      searchPlaceholder={section?.searchPlaceholder ?? "Search ML docs..."}
    />
  )
}