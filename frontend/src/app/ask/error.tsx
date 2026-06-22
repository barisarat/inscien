"use client"

// Next.js App Router error boundary for the /ask subtree — the whole app, since `/`
// redirects here. Catches render errors in AskClient, the providers, and the skill modes so
// an unexpected throw shows a calm recovery screen instead of a blank page.

import { useEffect } from "react"
import Link from "next/link"

import styles from "./error.module.css"

export default function AskError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the real error in the console for debugging; the UI stays calm.
    console.error("Unhandled error in /ask:", error)
  }, [error])

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Something broke unexpectedly</h1>
        <p className={styles.body}>
          The workspace hit an error it couldn’t recover from on its own. Your library and
          indexed papers are safe — try reloading the view.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => reset()}>
            Reload
          </button>
          <Link href="/ask" className={styles.secondary}>
            Start a new chat
          </Link>
        </div>
      </div>
    </main>
  )
}
