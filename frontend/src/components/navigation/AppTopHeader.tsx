"use client"

import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import styles from "./AppTopHeader.module.css"

type AppTopHeaderProps = {
  sidebarOpen: boolean
  rightActions?: ReactNode
}

function buildAskPath(query: string) {
  return `/ask?q=${encodeURIComponent(query)}`
}

export default function AppTopHeader({
  sidebarOpen,
  rightActions,
}: AppTopHeaderProps) {
  const router = useRouter()
  const [searchValue, setSearchValue] = useState("")
  // On narrow viewports the field collapses to an icon; clicking it expands inline.
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const query = searchValue.trim()

    if (!query) return

    const askPath = buildAskPath(query)
    router.push(askPath)
  }

  return (
    <header className={`${styles.topHeader} ${sidebarOpen ? styles.topHeaderOpen : styles.topHeaderClosed}`}>
      <div className={`${styles.topHeaderInner} ${expanded ? styles.searchExpanded : ""}`}>
        <form className={styles.searchWrap} onSubmit={handleSubmit}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Ask the markets agent…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onBlur={() => {
              if (!searchValue) setExpanded(false)
            }}
          />

          {searchValue ? (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearchValue("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : (
            <span className={styles.shortcutHint}>
              <kbd>Enter</kbd>
            </span>
          )}
        </form>

        {/* Collapsed search: shown only when the bar is too narrow to type inline. */}
        <button
          type="button"
          className={styles.searchCollapsed}
          aria-label="Ask InScien"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {rightActions ? (
          <div className={styles.rightArea}>{rightActions}</div>
        ) : null}
      </div>
    </header>
  )
}
