"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth"
import styles from "./page.module.css"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function SignupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading } = useAuth()

  const nextPath = searchParams.get("next") || "/"
  const isMembershipFlow = nextPath === "/pricing"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(nextPath)
    }
  }, [isLoading, isAuthenticated, nextPath, router])

  const handleGoogle = useCallback(() => {
    const params = nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : ""
    window.location.href = `${API_BASE}/api/oauth/google/start${params}`
  }, [nextPath])

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setSubmitting(true)
      setErrorMsg("")

      try {
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            first_name: firstName,
            last_name: lastName,
            accept_terms: true,
            marketing_opt_in: marketingOptIn
          })
        })

        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}))
          const detail =
            typeof data === "object" &&
            data !== null &&
            "detail" in data &&
            typeof data.detail === "string"
              ? data.detail
              : "Could not create account"

          throw new Error(detail)
        }

        const params = new URLSearchParams()
        params.set("email", email)
        params.set("next", nextPath)

        router.replace(`/verify-email?${params.toString()}`)
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong")
        setSubmitting(false)
      }
    },
    [email, password, firstName, lastName, marketingOptIn, router, nextPath]
  )

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerTop}>
          <Link href="/" className={styles.backLink}>
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
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>
            {isMembershipFlow
              ? "Create an account to continue to membership checkout. We will send you a 6 digit verification code."
              : "Create an account to save progress, bookmarks, Ask history, and downloads. We will send you a 6 digit verification code."}
          </p>
        </header>

        <main className={styles.content}>
          <section className={styles.section}>
            <div className={styles.card}>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={handleGoogle}
                disabled={submitting}
              >
                <GoogleMark />
                <span className={styles.googleLabel}>Continue with Google</span>
              </button>
            </div>
          </section>

          <div className={styles.divider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerText}>or</span>
            <span className={styles.dividerLine} />
          </div>

          <section className={styles.section}>
            <div className={styles.card}>
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.nameRow}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="first_name">First name</label>
                    <input
                      id="first_name"
                      type="text"
                      className={styles.input}
                      value={firstName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="last_name">Last name</label>
                    <input
                      id="last_name"
                      type="text"
                      className={styles.input}
                      value={lastName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className={styles.input}
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <span className={styles.hint}>At least 8 characters.</span>
                </div>

                <div className={styles.field}>
                  <label className={styles.checkboxLabel} htmlFor="marketing_opt_in">
                    <input
                      id="marketing_opt_in"
                      type="checkbox"
                      className={styles.checkbox}
                      checked={marketingOptIn}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMarketingOptIn(e.target.checked)}
                    />
                    <span>
                      Send me occasional product updates and learning resources.
                    </span>
                  </label>
                </div>

                <p className={styles.termsText}>
                  By creating an account, you agree to our{" "}
                  <Link href="/terms" className={styles.inlineLink} target="_blank">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className={styles.inlineLink} target="_blank">
                    Privacy Policy
                  </Link>
                  .
                </p>

                {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={submitting}
                >
                  {submitting ? "Creating account..." : "Create account"}
                </button>
              </form>
            </div>
          </section>

          <p className={styles.switchMode}>
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className={styles.switchLink}>
              Sign in
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.loading}>Loading...</div></div>}>
      <SignupPageInner />
    </Suspense>
  )
}
