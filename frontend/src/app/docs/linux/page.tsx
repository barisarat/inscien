import ListingPage from "@/components/listings/ListingPage"
import { getDocsListingGroups, getDocsSection } from "../data/registry"

export const metadata = {
  title: "Linux Docs | FinanceLab",
  description: "Linux desktop, system operations, Arch, i3, hardware, backup, and maintenance workflows.",
}

export default function LinuxDocsPage() {
  const section = getDocsSection("linux")
  const groups = getDocsListingGroups("linux")

  return (
    <ListingPage
      title={section?.title ?? "Linux Docs"}
      desc={section?.desc ?? ""}
      sidebarTitle={section?.sidebarTitle ?? "Linux Docs"}
      groups={groups}
      searchPlaceholder={section?.searchPlaceholder ?? "Search Linux docs..."}
    />
  )
}