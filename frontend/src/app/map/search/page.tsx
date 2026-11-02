import { Suspense } from "react"

import SearchResults from "./SearchResults"

// The results of one Search or Ask run, described by the URL (see lib/search.ts). Its own page,
// so it never shares a screen with the Map; the ModeBar leads back.
export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  )
}
