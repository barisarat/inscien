import type { Metadata } from "next"
import ListingPage, { type ListingGroup } from "@/components/listings/ListingPage"
import { notebooks, CATEGORY_ORDER } from "./data"

export const metadata: Metadata = {
  title: "Notebooks | FinanceLab",
  description:
    "Runnable notebook collections. View in the browser, download the code, and run locally.",
}

export default function NotebooksPage() {
  const groups: ListingGroup[] = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      items: notebooks
        .filter((n) => n.category === cat)
        .map((n) => ({
          id: n.id,
          name: n.name,
          desc: n.desc,
          href: `/notebooks/${n.id}`,
        })),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <ListingPage
      title="Notebooks"
      desc="Runnable notebook collections. View in the browser, download the code, and run locally."
      sidebarTitle="Notebooks"
      groups={groups}
      searchPlaceholder="Filter notebooks"
    />
  )
}
