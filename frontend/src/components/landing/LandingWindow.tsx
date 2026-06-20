import React from "react"
import styles from "./landing.module.css"

// Presentational browser-window chrome shared by the hero, module screenshots, and the
// featured browsers. No hooks, so it is safe to render from both server and client components.
export default function LandingWindow({
  children,
  className = "",
  contentClassName = "",
}: {
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div className={`${styles.windowShell} ${className}`}>
      <div className={styles.windowBar}>
        <div className={styles.windowDots}>
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className={`${styles.windowContent} ${contentClassName}`}>
        {children}
      </div>
    </div>
  )
}
