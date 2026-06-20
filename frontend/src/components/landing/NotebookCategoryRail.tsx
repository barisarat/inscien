"use client"

import { useState } from "react"
import Link from "next/link"
import styles from "./landing.module.css"
import RevealItem from "./RevealItem"

const CATEGORY_PREVIEW_LIMIT = 4

export default function NotebookCategoryRail({
  categories,
}: {
  categories: string[]
}) {
  const [showAll, setShowAll] = useState(false)

  const visibleCategories = showAll ? categories : categories.slice(0, CATEGORY_PREVIEW_LIMIT)
  const hasMore = categories.length > CATEGORY_PREVIEW_LIMIT

  return (
    <div className={styles.railSection}>
      <div className={styles.railHeader}>
        <RevealItem className={styles.railHeaderText}>
          <h3 className={styles.railTitle}>Notebook categories</h3>
          <p className={styles.railSub}>
            Practical workflows organized by applied domain
          </p>
        </RevealItem>

        {hasMore && (
          <RevealItem delay={80}>
            <button
              type="button"
              className={styles.railViewAll}
              onClick={() => setShowAll((current) => !current)}
              aria-expanded={showAll}
            >
              {showAll ? "View less" : "See all"}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d={showAll ? "M3 9l4-4 4 4" : "M5 3l4 4-4 4"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </RevealItem>
        )}
      </div>

      <div className={styles.cardGrid}>
        {visibleCategories.map((cat, index) => (
          <RevealItem key={cat} delay={Math.min(index * 55, 240)}>
            <Link href="/notebooks" className={styles.landingCard}>
              <div className={styles.cardMeta}>
                <span className={styles.cardMarker} aria-hidden="true" />
              </div>
              <h4 className={styles.cardTitle}>{cat}</h4>
              <p className={styles.cardDesc}>
                Working examples for analysis, modeling, data pipelines, and applied research.
              </p>
            </Link>
          </RevealItem>
        ))}
      </div>
    </div>
  )
}
