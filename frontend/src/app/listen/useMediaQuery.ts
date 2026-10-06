"use client"

import { useEffect, useState } from "react"

// Matches after mount only. The page is prerendered by the static export, so a query evaluated
// during render would bake one layout into the HTML and then disagree with the first paint.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const apply = () => setMatches(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [query])
  return matches
}
