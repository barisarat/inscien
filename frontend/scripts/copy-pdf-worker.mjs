// Copy the pdf.js worker into public/ so it's served as a stable same-origin asset
// (`/pdf.worker.min.mjs`) by BOTH the Next dev server and the FastAPI static export — the
// `new URL(..., import.meta.url)` worker pattern doesn't resolve in a static export build.
// Resolved from the installed `pdfjs-dist` so the worker always matches react-pdf's pdf.js
// API version. Wired to predev/prebuild in package.json. Kept local/offline — no CDN.
import { createRequire } from "node:module"
import { copyFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
// Resolve via package.json + join (not a deep require.resolve) so pdfjs-dist's `exports`
// map can't block access to the build/ file.
const pdfjsDir = dirname(require.resolve("pdfjs-dist/package.json"))
const src = join(pdfjsDir, "build", "pdf.worker.min.mjs")
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public")

mkdirSync(publicDir, { recursive: true })
copyFileSync(src, join(publicDir, "pdf.worker.min.mjs"))
console.log("Copied pdf.js worker → public/pdf.worker.min.mjs")
