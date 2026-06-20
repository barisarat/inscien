"use client"
import { useMemo } from "react"
import { useAuth } from "@/lib/auth"
import ListingPage, { type ListingGroup } from "@/components/listings/ListingPage"
import { directory, CATEGORY_ORDER } from "./data"

export default function DirectoryPage() {
  useAuth()

  const groups = useMemo((): ListingGroup[] => {
    return CATEGORY_ORDER
      .map((cat) => ({
        category: cat,
        items: directory
          .filter((n) => n.category === cat)
          .map((n) => ({
            id: n.id,
            name: n.name,
            desc: n.desc,
            href: `/directory/${n.id}`,
          })),
      }))
      .filter((g) => g.items.length > 0)
  }, [])

  return (
    <ListingPage
      title="Directory"
      desc="Curated external tools and services grouped by topic."
      sidebarTitle="Directory"
      sidebarBrandHref="/directory"
      groups={groups}
      searchPlaceholder="Filter resources"
    />
  )
}
