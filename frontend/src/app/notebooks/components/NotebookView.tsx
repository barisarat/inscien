"use client"

import { useState, useCallback, useRef } from "react"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import { trackDownload } from "@/lib/api"
import type { NotebookEntry } from "../data"
import { NotebookInline, type NotebookInlineHandle } from "./NotebookInline"
import styles from "./NotebookPage.module.css"

function IconCode() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface SidebarItem {
  label: string
  href: string
}

interface Props {
  entry: NotebookEntry
  fileBasename: string
  downloadPath: string
  sidebarItems: SidebarItem[]
  bodyHtml: string
  headStyles: string
  notebookLoadError: boolean
}

function DownloadButton({
  entry,
  fileBasename,
  downloadPath,
}: {
  entry: NotebookEntry
  fileBasename: string
  downloadPath: string
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleClick = useCallback(() => {
    if (state === "loading") return

    setState("loading")
    setErrorMsg("")

    try {
      const a = document.createElement("a")
      a.href = downloadPath
      a.download = ""
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      trackDownload({
        notebook_id: entry.id,
        notebook_name: entry.name,
        notebook_category: entry.category,
        notebook_desc: entry.desc,
        file_basename: fileBasename,
      }).catch(() => {})

      setState("idle")
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Download failed")
      setState("error")
    }
  }, [state, entry, fileBasename, downloadPath])

  const label = "Download notebook"

  return (
    <div className={styles.downloadWrap}>
      <button
        type="button"
        className={styles.downloadBtn}
        onClick={handleClick}
        disabled={state === "loading"}
        aria-label={label}
        title={label}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v7M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className={styles.downloadBtnLabel}>
          {state === "loading" ? "Downloading..." : "Download notebook"}
        </span>
      </button>
      {state === "error" && <span className={styles.downloadError}>{errorMsg}</span>}
    </div>
  )
}

export function NotebookView({
  entry,
  fileBasename,
  downloadPath,
  sidebarItems,
  bodyHtml,
  headStyles,
  notebookLoadError,
}: Props) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const inlineRef = useRef<NotebookInlineHandle>(null)
  // Notebooks load with code hidden (see NotebookInline default). The toggle flips all.
  const [codeHidden, setCodeHidden] = useState(true)

  const toggleAllCode = useCallback(() => {
    setCodeHidden((hidden) => {
      const next = !hidden
      inlineRef.current?.setAllCollapsed(next)
      return next
    })
  }, [])

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/notebooks"
        sectionTitle="Notebooks"
        contextItems={sidebarItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader
        sidebarOpen={sidebarOpen}
        rightActions={
          <div className={styles.headerActions}>
            {!notebookLoadError && (
              <button
                type="button"
                className={styles.codeToggleBtn}
                onClick={toggleAllCode}
                aria-pressed={!codeHidden}
              >
                <IconCode />
                <span>{codeHidden ? "Show code" : "Hide code"}</span>
              </button>
            )}

            <DownloadButton
              entry={entry}
              fileBasename={fileBasename}
              downloadPath={downloadPath}
            />
          </div>
        }
      />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <main className={styles.main}>
            <section className={styles.contentBlock}>
              <NotebookInline
                ref={inlineRef}
                bodyHtml={bodyHtml}
                headStyles={headStyles}
                notebookLoadError={notebookLoadError}
              />
            </section>
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}