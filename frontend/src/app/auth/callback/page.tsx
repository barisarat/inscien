"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"

function CallbackHandler() {
  const processed = useRef(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const queryParams = new URLSearchParams(window.location.search)

    const access = hashParams.get("access") || queryParams.get("access")
    const refresh = hashParams.get("refresh") || queryParams.get("refresh")
    const next = searchParams.get("next") || "/"

    if (access && refresh) {
      localStorage.setItem("financelab_access", access)
      localStorage.setItem("financelab_refresh", refresh)

      window.history.replaceState(null, "", "/auth/callback")
      window.location.replace(next)
      return
    }

    window.location.replace("/login?error=auth_failed")
  }, [searchParams])

  return <>Signing you in…</>
}

export default function AuthCallbackPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        fontFamily: "var(--sans)",
        color: "var(--text-3)",
        fontSize: "var(--text-sm)",
      }}
    >
      <Suspense fallback="Signing you in…">
        <CallbackHandler />
      </Suspense>
    </div>
  )
}
