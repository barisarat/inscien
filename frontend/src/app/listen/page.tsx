import { Suspense } from "react"

import ListenReader from "./ListenReader"

// One static page, addressed by ?b=<slug>. A real /listen/[slug] would need every slug at
// build time (generateStaticParams), and narrations are built later, by hand, on the GPU - a
// finished bundle has to show up without rebuilding the frontend. useSearchParams needs the
// Suspense boundary for that same static export.
export default function ListenPage() {
  return (
    <Suspense fallback={null}>
      <ListenReader />
    </Suspense>
  )
}
