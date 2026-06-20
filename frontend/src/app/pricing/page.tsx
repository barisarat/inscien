"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { Info } from "lucide-react"
import { useAuth } from "@/lib/auth"
import styles from "./page.module.css"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const ASK_INFO =
  "Ask is the FinanceLab assistant for market analysis, signal research, backtests, and workflow follow-ups."

type Feature = { label: string; info?: string }

const FREE_FEATURES: Feature[] = [
  { label: "Basic Ask access", info: ASK_INFO },
  { label: "Market and news-signal analysis" },
  { label: "Signal charts and comparisons" },
  { label: "Backtest previews" },
]

const FREE_ACCOUNT_FEATURES: Feature[] = [
  { label: "Basic Ask history", info: ASK_INFO },
  { label: "Bookmarks" },
  { label: "Saved market research progress" },
  { label: "Account preferences" },
  { label: "Upgrade anytime" },
]

const MEMBERSHIP_FEATURES: Feature[] = [
  { label: "Higher Ask limits", info: ASK_INFO },
  { label: "Full Ask history" },
  { label: "Vote on future signal-data features" },
  { label: "Request new research workflows" },
  { label: "Early access to selected signal tools" },
  { label: "Member updates" },
  { label: "Support continued signal-data product development" },
]

export default function PricingPage() {
  const { isAuthenticated, isLoading, tier, login } = useAuth()
  const [busy, setBusy] = useState(false)

  const isMember = tier === "pro"
  const isFreeUser = isAuthenticated && !isMember

  const handleMembership = useCallback(async () => {
    if (!isAuthenticated) {
      login("/pricing")
      return
    }

    setBusy(true)

    try {
      const token = localStorage.getItem("financelab_access")
      const res = await fetch(`${API_BASE}/api/payment/gumroad/checkout-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id: "pro" }),
      })

      if (!res.ok) throw new Error("Failed to get checkout link")

      const data: { url?: string } = await res.json()

      if (data.url) {
        const checkoutWindow = window.open(data.url, "_blank", "noopener,noreferrer")

        if (!checkoutWindow) window.location.href = data.url
      }
    } catch {
      alert("Something went wrong. Please try again.")
    } finally {
      setBusy(false)
    }
  }, [isAuthenticated, login])

  return (
    <div className={styles.page}>
      <div className={styles.heroBg}>
        <div className={styles.container}>
          <div className={styles.headerTop}>
            <Link href="/ask" className={styles.backLink}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.backArrow}>
                <path
                  d="M10 12L6 8L10 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.backLabel}>FinanceLab</span>
            </Link>
          </div>

          <header className={styles.hero}>
            <h1 className={styles.title}>Membership</h1>
            <p className={styles.subtitle}>
              FinanceLab is free to read and use.
            </p>
            <p className={styles.subtitle}>
              Use FinanceLab for market and signal research without an account, create a free account to save your work, or become a member for higher Ask access and future feature input.
            </p>
          </header>

          <main className={styles.content}>
            <section className={styles.membershipGrid} aria-label="Membership options">
              <article className={styles.freeCard}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Public access</h2>
                  <p className={styles.cardMeta}>Free · no account required</p>
                  <p className={styles.cardDescription}>
                    Core market research and signal exploration stay open for analysts, builders, and curious investors.
                  </p>
                </div>

                <div className={styles.cardCta}>
                  {isLoading ? (
                    <span className={styles.currentAccess}>Loading...</span>
                  ) : !isAuthenticated ? (
                    <span className={styles.currentAccess}>Current access</span>
                  ) : (
                    <span className={styles.currentAccess}>Included</span>
                  )}
                </div>

                <p className={styles.includedLabel}>What you get:</p>
                <ul className={styles.featureList}>
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature.label} className={styles.featureItem}>
                      <span className={styles.checkIcon} aria-hidden="true" />
                      <span className={styles.featureLabel}>
                        {feature.label}
                        {feature.info ? (
                          <span className={styles.askInfo}>
                            <button
                              type="button"
                              className={styles.askInfoBtn}
                              aria-label="What is Ask?"
                            >
                              <Info size={13} strokeWidth={1.7} aria-hidden="true" />
                            </button>
                            <span role="tooltip" className={styles.askInfoTip}>
                              {feature.info}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.accountCard}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Free account</h2>
                  <p className={styles.cardMeta}>Free · sign in to save</p>
                  <p className={styles.cardDescription}>
                    Save useful material and keep track of what you have explored.
                  </p>
                </div>

                <div className={styles.cardCta}>
                  {isLoading ? (
                    <span className={styles.currentAccess}>Loading...</span>
                  ) : isFreeUser ? (
                    <span className={styles.currentAccess}>Current plan</span>
                  ) : isMember ? (
                    <span className={styles.currentAccess}>Included</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => login("/pricing")}
                    >
                      Create free account
                    </button>
                  )}
                </div>

                <p className={styles.includedLabel}>What you get:</p>
                <ul className={styles.featureList}>
                  {FREE_ACCOUNT_FEATURES.map((feature) => (
                    <li key={feature.label} className={styles.featureItem}>
                      <span className={styles.checkIcon} aria-hidden="true" />
                      <span className={styles.featureLabel}>
                        {feature.label}
                        {feature.info ? (
                          <span className={styles.askInfo}>
                            <button
                              type="button"
                              className={styles.askInfoBtn}
                              aria-label="What is Ask?"
                            >
                              <Info size={13} strokeWidth={1.7} aria-hidden="true" />
                            </button>
                            <span role="tooltip" className={styles.askInfoTip}>
                              {feature.info}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.memberCard}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Membership</h2>
                  <p className={styles.cardMeta}>$10/month · advanced access</p>
                  <p className={styles.cardDescription}>
                    For regular FinanceLab users who want more Ask access, a stronger voice in what gets built next, and a way to support continued signal-data product development.
                  </p>
                </div>

                <div className={styles.cardCta}>
                  {isMember ? (
                    <span className={styles.currentAccess}>Current plan</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.primaryCta}
                      onClick={handleMembership}
                      disabled={busy || isLoading}
                    >
                      {busy
                        ? "Starting checkout..."
                        : isLoading
                          ? "Loading..."
                          : "Become a member"}
                    </button>
                  )}
                </div>

                <p className={styles.includedLabel}>What you get:</p>
                <ul className={styles.featureList}>
                  {MEMBERSHIP_FEATURES.map((feature) => (
                    <li key={feature.label} className={styles.featureItem}>
                      <span className={styles.checkIcon} aria-hidden="true" />
                      <span className={styles.featureLabel}>
                        {feature.label}
                        {feature.info ? (
                          <span className={styles.askInfo}>
                            <button
                              type="button"
                              className={styles.askInfoBtn}
                              aria-label="What is Ask?"
                            >
                              <Info size={13} strokeWidth={1.7} aria-hidden="true" />
                            </button>
                            <span role="tooltip" className={styles.askInfoTip}>
                              {feature.info}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
