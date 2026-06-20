"use client"

import { Suspense, useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import styles from "./page.module.css"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const CODE_LENGTH = 6

function readErrorMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail
  }

  return fallback
}

function VerifyEmailPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const email = searchParams.get("email") || ""
  const nextPath = searchParams.get("next") || "/"
  const status = searchParams.get("status")

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""))
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [successMsg, setSuccessMsg] = useState(
    status === "verified" ? "Your email address has been verified. You can now sign in." : ""
  )

  const loginHref = useMemo(() => {
    return `/login?next=${encodeURIComponent(nextPath)}`
  }, [nextPath])

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
      setErrorMsg("")
      setSuccessMsg("")

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
      setErrorMsg("")
      setSuccessMsg("")
      applyCode(e.clipboardData.getData("text"), index)
    },
    [applyCode]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setSubmitting(true)
      setErrorMsg("")
      setSuccessMsg("")

      try {
        const res = await fetch(`${API_BASE}/api/auth/verify-email-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            code: normalizedCode
          })
        })

        if (!res.ok) {
          const data: unknown = await res.json().catch(() => ({}))
          throw new Error(readErrorMessage(data, "Could not verify email"))
        }

        setSuccessMsg("Email verified. Redirecting to sign in...")
        router.replace(loginHref)
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Something went wrong")
      } finally {
        setSubmitting(false)
      }
    },
    [email, normalizedCode, router, loginHref]
  )

  const handleResend = useCallback(async () => {
    setResending(true)
    setErrorMsg("")
    setSuccessMsg("")

    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-verification-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}))
        throw new Error(readErrorMessage(data, "Could not resend verification code"))
      }

      setDigits(Array(CODE_LENGTH).fill(""))
      setSuccessMsg("A new verification code has been sent.")
      focusInput(0)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setResending(false)
    }
  }, [email, focusInput])

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

        <main className={styles.card}>
          <h1 className={styles.title}>Verify your email</h1>

          {email ? (
            <p className={styles.message}>
              We sent a 6 digit verification code to {email}. Enter it below to activate your account.
            </p>
          ) : (
            <p className={styles.message}>
              Enter the 6 digit verification code we sent to your email address.
            </p>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="verification_code_0">Verification code</label>

              <div className={styles.codeGroup} aria-label="Verification code">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    id={`verification_code_${index}`}
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

            {errorMsg && <div className={styles.errorMsg}>{errorMsg}</div>}
            {successMsg && <div className={styles.successMsg}>{successMsg}</div>}

            <button
              type="submit"
              className={styles.primaryLink}
              disabled={submitting || normalizedCode.length !== CODE_LENGTH || !email}
            >
              {submitting ? "Verifying..." : "Verify email"}
            </button>
          </form>

          <div className={styles.secondaryActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleResend}
              disabled={resending || !email}
            >
              {resending ? "Sending..." : "Send a new code"}
            </button>

            <Link href={loginHref} className={styles.secondaryLink}>
              Back to sign in
            </Link>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.page}><div className={styles.loading}>Loading...</div></div>}>
      <VerifyEmailPageInner />
    </Suspense>
  )
}