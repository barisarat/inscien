"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// InScien is a single-purpose research workbench — the chat IS the app. Redirect / → /ask.
// Done client-side because the static export has no server to issue a redirect.
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/ask")
  }, [router])
  return null
}
