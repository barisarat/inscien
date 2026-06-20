"use client"

import { useMemo, useState, Suspense } from "react"
import Link from "next/link"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import styles from "./listing-page.module.css"

export interface ListingItem {
  id: string
  name: string
  desc: string
  href: string
}

export interface ListingGroup {
  category: string
  items: ListingItem[]
}

interface ListingPageProps {
  title: string
  desc: string
  sidebarTitle: string
  sidebarBrandHref?: string
  groups: ListingGroup[]
  searchPlaceholder?: string
  filterFn?: (item: ListingItem & { category: string }, query: string) => boolean
}

function defaultFilter(
  item: ListingItem & { category: string },
  query: string,
): boolean {
  const terms = query.split(/\s+/).filter(Boolean)
  const haystack = `${item.name} ${item.desc} ${item.category}`.toLowerCase()
  return terms.some((term) => haystack.includes(term))
}

function ListingRow({ item }: { item: ListingItem }) {
  return (
    <div className={styles.row}>
      <Link href={item.href} className={styles.rowLink}>
        <div className={styles.rowMain}>
          <div className={styles.rowName}>{item.name}</div>
          <div className={styles.rowDesc}>{item.desc}</div>
        </div>
        <div className={styles.rowArrow} aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6 4L10 8L6 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </Link>
    </div>
  )
}

function ListingContent({
  title,
  desc,
  sidebarTitle,
  sidebarBrandHref = "/notebooks",
  groups,
  searchPlaceholder = "Filter this page...",
  filterFn = defaultFilter,
}: ListingPageProps) {
  const [query, setQuery] = useState("")
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()

  const filteredGroups = useMemo((): ListingGroup[] => {
    const q = query.toLowerCase().trim()

    // Group (category) order is preserved as given; items within each group are always
    // sorted alphabetically by name so listings don't depend on manual registry order.
    const byName = (a: ListingItem, b: ListingItem) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })

    const visibleGroups = !q
      ? groups
      : groups
          .map((group) => ({
            category: group.category,
            items: group.items.filter((item) => filterFn({ ...item, category: group.category }, q)),
          }))
          .filter((group) => group.items.length > 0)

    return visibleGroups.map((group) => ({
      category: group.category,
      items: [...group.items].sort(byName),
    }))
  }, [query, groups, filterFn])

  const totalFiltered = filteredGroups.reduce((sum, group) => sum + group.items.length, 0)
  const resultLabel = `${totalFiltered} result${totalFiltered !== 1 ? "s" : ""}`

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref={sidebarBrandHref}
        sectionTitle={sidebarTitle}
        contextItems={[]}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader sidebarOpen={sidebarOpen} />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.desc}>{desc}</p>
          </header>

          <main className={styles.main}>
            <section className={styles.localSearch}>
              <div className={styles.localSearchWrap}>
                <svg className={styles.localSearchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>

                <input
                  type="text"
                  className={styles.localSearchInput}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                {query ? (
                  <button
                    type="button"
                    className={styles.localSearchClear}
                    onClick={() => setQuery("")}
                    aria-label="Clear filter"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <span className={styles.localSearchCount}>{resultLabel}</span>
            </section>

            {filteredGroups.length > 0 ? (
              <div className={styles.groupsWrap}>
                {filteredGroups.map((group) => (
                  <section key={group.category} className={styles.group}>
                    <div className={styles.groupHeader}>
                      <h2 className={styles.groupTitle}>{group.category}</h2>
                      <span className={styles.groupCount}>{group.items.length}</span>
                    </div>
                    <div className={styles.listWrap}>
                      {group.items.map((item) => (
                        <ListingRow key={item.href} item={item} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>
                  No results for &ldquo;{query}&rdquo;
                </p>
              </div>
            )}
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

export default function ListingPage(props: ListingPageProps) {
  return (
    <Suspense fallback={null}>
      <ListingContent {...props} />
    </Suspense>
  )
}
