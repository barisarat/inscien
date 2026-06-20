"use client"

import { useMemo, useState } from "react"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import styles from "./ToolCategoryPage.module.css"
import type { AiTool } from "../data/types"

type Props = {
  categoryLabel: string
  categoryDesc: string
  tools: AiTool[]
  sidebarItems: { label: string; href: string }[]
}

function matchesQuery(tool: AiTool, query: string) {
  const terms = query.split(/\s+/).filter(Boolean)
  const haystack = `${tool.name} ${tool.oneLine} ${tool.role} ${tool.group} ${tool.tags.join(" ")}`.toLowerCase()
  return terms.some((term) => haystack.includes(term))
}

// Group tools by their `group` sub-category, preserving the order in which groups first
// appear (the data is pre-ordered by sub-group, so this yields the intended section order).
function groupTools(tools: AiTool[]): { group: string; tools: AiTool[] }[] {
  const map = new Map<string, AiTool[]>()
  for (const tool of tools) {
    const list = map.get(tool.group)
    if (list) list.push(tool)
    else map.set(tool.group, [tool])
  }
  return Array.from(map, ([group, groupTools]) => ({ group, tools: groupTools }))
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="15 3 21 3 21 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="10"
        y1="14"
        x2="21"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ToolCard({ tool }: { tool: AiTool }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{tool.name}</h2>
          {tool.url ? (
            <a
              href={tool.url}
              target="_blank"
              rel="noreferrer"
              className={styles.externalLink}
            >
              View source
              <ExternalIcon />
            </a>
          ) : null}
        </div>

        {tool.oneLine ? <p className={styles.oneLine}>{tool.oneLine}</p> : null}
      </div>
    </article>
  )
}

export default function ToolCategoryClient({
  categoryLabel,
  categoryDesc,
  tools,
  sidebarItems,
}: Props) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const [query, setQuery] = useState("")

  const trimmed = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!trimmed) return tools
    return tools.filter((tool) => matchesQuery(tool, trimmed))
  }, [tools, trimmed])

  const groups = useMemo(() => groupTools(filtered), [filtered])

  const resultLabel = `${filtered.length} tool${filtered.length !== 1 ? "s" : ""}`

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/ai-ml-tools"
        sectionTitle="AI/ML Tools"
        contextItems={sidebarItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader sidebarOpen={sidebarOpen} />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{categoryLabel}</h1>
            {categoryDesc ? <p className={styles.desc}>{categoryDesc}</p> : null}
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
                  placeholder="Search tools"
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

            {groups.length > 0 ? (
              <div className={styles.groupsWrap}>
                {groups.map((group) => (
                  <section key={group.group} className={styles.subGroup}>
                    <div className={styles.subGroupHeader}>
                      <h2 className={styles.subGroupTitle}>{group.group}</h2>
                      <span className={styles.subGroupCount}>{group.tools.length}</span>
                    </div>
                    <div className={styles.list}>
                      {group.tools.map((tool) => (
                        <ToolCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyCard}>
                  <div className={styles.emptyTitle}>No tools found</div>
                  <p className={styles.emptyText}>
                    No tools match &ldquo;{query}&rdquo;. Try a different search.
                  </p>
                </div>
              </div>
            )}
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
