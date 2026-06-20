"use client"
import { ReactNode } from "react"
import { useAuth } from "@/lib/auth"
import styles from "./DirectoryDetailPage.module.css"

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.backArrow}>
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface DirectoryDetailPageProps {
  title: string
  children: ReactNode
}

export default function DirectoryDetailPage({ title, children }: DirectoryDetailPageProps) {
  useAuth()
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <a href="/directory" className={styles.backLink}>
            <BackIcon />
            <span className={styles.backLabel}>Directory</span>
          </a>
        </div>
        <div className={styles.headerMain}>
          <h1 className={styles.pageTitle}>{title}</h1>
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}