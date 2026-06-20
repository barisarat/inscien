"use client"

import { Suspense, useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import styles from "./page.module.css"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const CODE_LENGTH = 6

type ApiMessage = {
  detail?: string
}

function ResetPasswordInner() {
  const router = useRouter()
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const [email, setEmail] = useState("")
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""))
  const [codeSent, setCodeSent] = useState(false)

  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState("")
  const [requestSuccess, setRequestSuccess] = useState("")

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [confirmError, setConfirmError] = useState("")
  const [confirmSuccess, setConfirmSuccess] = useState("")

  const normalizedEmail = useMemo(() => {
    return email.trim().toLowerCase()
  }, [email])

  const normalizedCode = digits.join("")

  const focusInput = useCallback((index: number) => {
    const nextInput = inputRefs.current[index]

    if (nextInput) {
      nextInput.focus()
      nextInput.select()
    }
  }, [])

  const applyCode = useCallback(
    (value: string, startIndex = 0) => {
      const cleanValue = value.replace(/\D/g, "").slice(0, CODE_LENGTH - startIndex)

      if (!cleanValue) {
        return
      }

      setDigits((currentDigits) => {
        const nextDigits = [...currentDigits]

        cleanValue.split("").forEach((digit, offset) => {
          nextDigits[startIndex + offset] = digit
        })

        return nextDigits
      })

      const nextIndex = Math.min(startIndex + cleanValue.length, CODE_LENGTH - 1)
      focusInput(nextIndex)
    },
    [focusInput]
  )

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      setConfirmError("")
      setConfirmSuccess("")

      const cleanValue = value.replace(/\D/g, "")

      if (cleanValue.length > 1) {
        applyCode(cleanValue, index)
        return
      }

      setDigits((currentDigits) => {
        const nextDigits = [...currentDigits]
        nextDigits[index] = cleanValue
        return nextDigits
      })

      if (cleanValue && index < CODE_LENGTH - 1) {
        focusInput(index + 1)
      }
    },
    [applyCode, focusInput]
  )

  const handleDigitKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (digits[index]) {
          setDigits((currentDigits) => {
            const nextDigits = [...currentDigits]
            nextDigits[index] = ""
            return nextDigits
          })

          return
        }

        if (index > 0) {
          setDigits((currentDigits) => {
            const nextDigits = [...currentDigits]
            nextDigits[index - 1] = ""
            return nextDigits
          })

          focusInput(index - 1)
        }
      }

      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault()
        focusInput(index - 1)
      }

      if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
        e.preventDefault()
        focusInput(index + 1)
      }
    },
    [digits, focusInput]
  )

  const handleDigitPaste = useCallback(
    (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      setConfirmError("")
      setConfirmSuccess("")
      applyCode(e.clipboardData.getData("text"), index)
    },
    [applyCode]
  )

  async function requestEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setRequestError("")
    setRequestSuccess("")
    setConfirmError("")
    setConfirmSuccess("")

    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setRequestError("Please enter a valid email.")
      return
    }

    setRequestSubmitting(true)

    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      })

      const data = await res.json().catch(() => ({})) as ApiMessage

      if (!res.ok) {
        throw new Error(data.detail || "Could not send reset code.")
      }

      setDigits(Array(CODE_LENGTH).fill(""))
      setCodeSent(true)
      setRequestSuccess(data.detail || "If the email exists, a password reset code has been sent.")

      setTimeout(() => {
        focusInput(0)
      }, 0)
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Network error. Please try again.")
    } finally {
      setRequestSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setConfirmError("")
    setConfirmSuccess("")

    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setConfirmError("Please enter a valid email.")
      return
    }

    if (normalizedCode.length !== CODE_LENGTH) {
      setConfirmError("Reset code must be 6 digits.")
      return
    }

    if (password.length < 8) {
      setConfirmError("Password must be at least 8 characters.")
      return
    }

    if (password !== confirm) {
      setConfirmError("Passwords do not match.")
      return
    }

    setConfirmSubmitting(true)

    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          code: normalizedCode,
          new_password: password
        })
      })

      const data = await res.json().catch(() => ({})) as ApiMessage

      if (!res.ok) {
        throw new Error(data.detail || "Error updating password.")
      }

      setConfirmSuccess(data.detail || "Password updated. You can sign in now.")

      setTimeout(() => {
        router.replace("/login")
      }, 1200)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Network error. Please try again.")
    } finally {
      setConfirmSubmitting(false)
    }
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
          <h1 className={styles.title}>Reset password</h1>
          <p className={styles.subtitle}>
            {codeSent
              ? "Enter the 6 digit code from your email and create a new password."
              : "Enter your email address and we will send you a reset code."}
          </p>
        </header>

        <main className={styles.content}>
          <section className={styles.section}>
            <div className={styles.card}>
              <form onSubmit={requestEmail} className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={requestSubmitting || confirmSubmitting}
                    required
                  />
                </div>

                {requestError && <div className={styles.errorMsg}>{requestError}</div>}
                {requestSuccess && <div className={styles.successMsg}>{requestSuccess}</div>}

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={requestSubmitting || confirmSubmitting}
                >
                  {requestSubmitting ? "Sending..." : codeSent ? "Send a new code" : "Send reset code"}
                </button>
              </form>

              {codeSent && (
                <form onSubmit={handleSubmit} className={styles.confirmForm}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="reset_code_0">Reset code</label>

                    <div className={styles.codeGroup} aria-label="Reset code">
                      {digits.map((digit, index) => (
                        <input
                          key={index}
                          id={`reset_code_${index}`}
                          ref={(element) => {
                            inputRefs.current[index] = element
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          className={styles.codeInput}
                          value={digit}
                          onChange={(e) => handleDigitChange(index, e.target.value)}
                          onKeyDown={(e) => handleDigitKeyDown(index, e)}
                          onPaste={(e) => handleDigitPaste(index, e)}
                          maxLength={1}
                          required
                          aria-label={`Digit ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="password">New password</label>
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
                    <label className={styles.label} htmlFor="confirm">Confirm password</label>
                    <input
                      id="confirm"
                      type="password"
                      className={styles.input}
                      value={confirm}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>

                  {confirmError && <div className={styles.errorMsg}>{confirmError}</div>}
                  {confirmSuccess && <div className={styles.successMsg}>{confirmSuccess}</div>}

                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={confirmSubmitting || normalizedCode.length !== CODE_LENGTH}
                  >
                    {confirmSubmitting ? "Updating..." : "Update password"}
                  </button>
                </form>
              )}
            </div>
          </section>

          <div className={styles.secondaryActions}>
            <span className={styles.secondaryText}>Remember your password?</span>

            <Link href="/login" className={styles.switchLink}>
              Sign in
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.loading}>Loading...</div></div>}>
      <ResetPasswordInner />
    </Suspense>
  )
}