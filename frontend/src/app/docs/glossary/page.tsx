import ListingPage from "@/components/listings/ListingPage"
import { getDocsListingGroups, getDocsSection } from "../data/registry"

export const metadata = {
  title: "Glossary | FinanceLab",
  description: "Practical terminology for machine learning, databases, programming, and data representation.",
}

export default function GlossaryDocsPage() {
  const section = getDocsSection("glossary")
  const groups = getDocsListingGroups("glossary")

  return (
    <ListingPage
      title={section?.title ?? "Glossary"}
      desc={section?.desc ?? ""}
      sidebarTitle={section?.sidebarTitle ?? "Glossary"}
      groups={groups}
      searchPlaceholder={section?.searchPlaceholder ?? "Search glossary..."}
    />
  )
}