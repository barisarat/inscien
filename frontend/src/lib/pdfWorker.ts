// pdf.js worker setup for react-pdf, kept OFFLINE/local (no CDN) to preserve the
// privacy promise. The worker is resolved from the bundled `pdfjs-dist` package.
//
// If a Next 16 / Turbopack build can't resolve the `new URL(..., import.meta.url)`
// worker asset, the fallback is to copy `pdf.worker.min.mjs` into `frontend/public/`
// and set: pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs".
import { pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

export { pdfjs }
