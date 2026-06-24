"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// InScien opens straight into the Map + Narrate workspace. Redirect / -> /map.
// Done client-side because the static export has no server to issue a redirect.
export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/map")
  }, [router])
  return null
}
