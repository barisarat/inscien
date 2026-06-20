"use client"

import { useState } from "react"
import Image from "next/image"
import styles from "./landing.module.css"
import LandingWindow from "./LandingWindow"

type FeaturedItem = { id: string; name: string }

export default function FeaturedBrowser({
  items,
  screenshots,
}: {
  items: FeaturedItem[]
  screenshots: string[]
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedItem = items[activeIndex]
  const previewSrc = screenshots[activeIndex]

  if (!selectedItem || !previewSrc) return null

  return (
    <div className={styles.featuredBrowser}>
      <LandingWindow
        className={styles.featuredWindow}
        contentClassName={styles.featuredPreviewFrame}
      >
        <Image
          key={selectedItem.id}
          src={previewSrc}
          alt={`${selectedItem.name} screenshot`}
          className={styles.featuredScreenshot}
          width={1280}
          height={800}
          loading="lazy"
        />
      </LandingWindow>

      <div className={styles.featuredTabs}>
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.featuredTab} ${index === activeIndex ? styles.featuredTabActive : ""}`}
            onClick={() => setActiveIndex(index)}
            aria-label={`Show ${item.name}`}
          >
            <span className={styles.featuredTabText}>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
