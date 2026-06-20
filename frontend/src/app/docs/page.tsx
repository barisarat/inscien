import ListingPage, { type ListingGroup } from "@/components/listings/ListingPage"
import { DOCS_SECTIONS } from "./data/registry"

export const metadata = {
  title: "Docs | FinanceLab",
  description: "Practical notes, workflows, and terminology for ML, development, Linux, and engineering work.",
}

function getDocsOverviewGroups(): ListingGroup[] {
  return [
    {
      category: "Docs",
      items: DOCS_SECTIONS.map((section) => ({
        id: section.slug,
        name: section.title,
        desc: section.desc,
        href: `/docs/${section.slug}`,
      })),
    },
  ]
}

export default function DocsPage() {
  return (
    <ListingPage
      title="Docs"
      desc="Practical notes, workflows, and terminology for ML, development, Linux, and engineering work."
      sidebarTitle="Docs"
      groups={getDocsOverviewGroups()}
      searchPlaceholder="Filter docs"
    />
  )
}
