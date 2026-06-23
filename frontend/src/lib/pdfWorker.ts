// pdf.js worker setup for react-pdf, kept OFFLINE/local (no CDN) to preserve the privacy
// promise. The worker is served as a same-origin static asset at /pdf.worker.min.mjs —
// copied into public/ by scripts/copy-pdf-worker.mjs (run on predev/prebuild) from the
// installed pdfjs-dist, so it always matches react-pdf's pdf.js version. We serve it as a
// static file rather than via `new URL(..., import.meta.url)` because that asset pattern
// doesn't resolve in a static export build (the production single-container serve).
import { pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

export { pdfjs }
