// Single source of truth for the backend origin. NEXT_PUBLIC_* is inlined at build time.
// Production/desktop builds serve the API and the static UI from one process (same origin),
// so the default is "" and requests use relative `/api/...` paths - port-agnostic. In dev the
// Next dev server (:3000) and the API (:8000) are separate origins, so default to localhost:8000.
// `NEXT_PUBLIC_API_URL` overrides either (e.g. a non-default backend port).
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "")

async function getErrorMessage(res: Response): Promise<string> {
  const data: unknown = await res.json().catch(() => ({}))

  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail
  }

  return `API error ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`
}

// A failed fetch (backend down / network / CORS) throws a raw TypeError ("Failed to fetch")
// - turn it into an actionable message that names the likely cause.
const BACKEND_UNREACHABLE = `Couldn't reach the InScien backend${API_BASE ? ` at ${API_BASE}` : ""}. Is it running?`

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error(BACKEND_UNREACHABLE)
  }
}

// InScien is single-user/local with no auth - these are plain calls.
async function authedGet<T>(path: string): Promise<T> {
  const res = await doFetch(path, { method: "GET" })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  return res.json()
}

async function authedAction<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await doFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  return res.json()
}

// ---- Settings (the Zotero data folder + display name) ----

export interface AppSettings {
  displayName: string
  zoteroDataDir: string
  zoteroDataDirDetected: string
}

export interface AppSettingsUpdate {
  displayName?: string
  zoteroDataDir?: string
}

export async function getSettings(): Promise<AppSettings> {
  return authedGet("/api/settings")
}

export async function updateSettings(body: AppSettingsUpdate): Promise<AppSettings> {
  return authedAction("/api/settings", "PUT", body)
}

// ---- Zotero library (collections and items) ----

export interface ZoteroCollection {
  collectionID: number
  key: string
  name: string
  parentCollectionID: number | null
  children: ZoteroCollection[]
  itemCount?: number
  builtSlugs?: string[] // built papers in this collection, recursively - "select this shelf"
}

export interface ZoteroItem {
  itemKey: string
  title: string | null
  authors: string[]
  year: string | null
  itemType: string | null
  isBookDefaultOff: boolean
  doi: string | null
  // Where the item stands in the reference pipeline. "built": an artifact exists in the library
  // (`slug` names it, and the row is selectable for the Map). "staged": its PDF waits for a
  // build. "unbuilt": nothing yet; buildable when hasPdf.
  hasPdf: boolean
  status: "built" | "staged" | "unbuilt"
  slug: string | null
  // The narration: "ready" (a bundle exists, `url` opens its listen view, with whether it was
  // heard to the end and how far, 0-100), "queued" (its PDF waits in the narration queue), or
  // "none" (narratable when hasPdf).
  narration: { status: "ready" | "queued" | "none"; url: string | null; finished?: boolean; percent?: number }
}

export async function fetchZoteroCollections(): Promise<{
  collections: ZoteroCollection[]
  liveConnected?: boolean
  libraryMissing?: boolean
  mountPath?: string
}> {
  return authedGet("/api/zotero/collections")
}

export async function fetchZoteroItems(collectionId: number): Promise<{ items: ZoteroItem[] }> {
  return authedGet(`/api/zotero/collections/${collectionId}/items`)
}

// ---- Map graph shapes ----

export interface GraphNode {
  id: string
  label: string
  type: "owned" | "external"
  year?: string | number | null
  month?: number | null // 1-12 when known; positions the node within its year column
  date?: string | null // OpenAlex publication_date (YYYY-MM-DD) - drives the timeline x-axis
  citedBy?: number | null // external: within-selection degree (shared anchors render bigger)
  globalCitedBy?: number | null // global OpenAlex cited-by count
  doi?: string | null
  collection?: string | null // owned: Zotero collection path, for grouping/color
  authors?: string[] // the reference card: parsed off the citing entry, or the Zotero record
  venue?: string | null
  narrationUrl?: string | null // owned: the listen view for this paper, when narrated
}

export interface DiscoveryGraph {
  nodes: GraphNode[]
  edges: { from: string; to: string }[]
  unmapped: string[]
  noDoi: string[]
}

// ---- Reference library (papers built from their own PDFs) ----
//
// The Map's data source. Everything here is read from local artifacts under `library/`, built by
// `tools/build.mjs`; the citation API is used during that build for identity and counts only,
// never for the reference list. So these calls are instant, cannot fail on a rate limit, and
// there is no job to poll.

export interface LibraryPaper {
  slug: string
  zoteroKey?: string | null
  source?: string | null
  title: string
  year?: number | null
  doi?: string | null
  citedBy?: number | null
  builtAt?: string | null
  referenceCount: number
  apiReferenceCount?: number | null
  missingFromApi?: number | null
  resolved?: number | null
  unresolved?: number | null
}

export interface LibrarySummary {
  papers: number
  // extracted = references + merged + internalRefs, always. Stated so the header cannot look
  // like extraction lost references when two of them are simply the same work.
  extracted: number
  merged: number
  internalRefs: number
  references: number // distinct works cited; smaller than the sum per paper once they overlap
  shared: number // cited by more than one selected paper
  internalEdges: number // one selected paper citing another
  missingFromApi: number
  unresolved: number
}

export interface LibraryGraph extends DiscoveryGraph {
  summary?: LibrarySummary
}

export async function listLibraryPapers(): Promise<{ papers: LibraryPaper[] }> {
  return authedGet("/api/library/papers")
}

// The reference map over the selected papers. Assembled from disk in one request.
export async function fetchLibraryGraph(slugs: string[]): Promise<LibraryGraph> {
  return authedAction("/api/library/graph", "POST", { slugs })
}

// ---- Narrations (the listen view) ----
//
// A bundle is data on disk, served file by file at /b/<slug>/<name> by routers/narrations.py.

export interface NarrationMeta {
  slug: string
  title: string
  duration_s: number
  voice: string
  voices?: string[]
  durations?: number[]
}

// One sentence of narration. `display` is what the page shows, `text` what was spoken - they
// differ for headings ("Section two." spoken, "2. METHOD" shown), which is why the source-pane
// aligner matches headings on display and paragraphs on text.
export interface Cue {
  node: number
  type: string
  level: number | null
  sent: number
  text: string
  display: string
  start: number
  end: number
}

export interface AnchorRect {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
}

// Page boxes are PDF points, so a highlight is positioned as a percentage of its page and
// survives zoom and a pane resize for free. `cues` is parallel to the cue list; a null entry
// means the aligner placed the paragraph but not that sentence.
export interface Anchors {
  pages: { width: number; height: number }[]
  images: string[]
  nodes: Record<string, { page: number; rects: AnchorRect[] }>
  cues: (AnchorRect[] | null)[]
}

export interface ProgressEntry {
  position?: number
  furthest?: number
  updated?: string
  finished?: boolean
}

export function bundleFileUrl(slug: string, name: string): string {
  return `${API_BASE}/b/${encodeURIComponent(slug)}/${name}`
}

async function bundleJson<T>(slug: string, name: string): Promise<T> {
  const res = await doFetch(`/b/${encodeURIComponent(slug)}/${name}`, { method: "GET" })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  return res.json()
}

export function fetchNarrationMeta(slug: string): Promise<NarrationMeta> {
  return bundleJson(slug, "meta.json")
}

export function fetchNarrationCues(slug: string, file = "cues.json"): Promise<Cue[]> {
  return bundleJson(slug, file)
}

// Absent for a bundle built without the source paper - the listen view then shows two panes.
export async function fetchNarrationAnchors(slug: string): Promise<Anchors | null> {
  try {
    return await bundleJson<Anchors>(slug, "anchors.json")
  } catch {
    return null
  }
}

// The whole file, every slug: the sidebar wants all of them and the reader wants one, and it
// is a few hundred bytes per bundle.
export function getProgress(): Promise<Record<string, ProgressEntry>> {
  return authedGet("/api/progress")
}

// One slug at a time, merged server-side - two clients (the desk and the phone) share the file.
// `position` comes from the reader, `finished` from the sidebar; they are written independently.
export function putProgress(
  slug: string,
  body: { position: number } | { finished: boolean }
): Promise<ProgressEntry> {
  return authedAction(`/api/progress/${encodeURIComponent(slug)}`, "PUT", body)
}

// ---- The one background job: build a paper or narrate it, followed in the job pane ----

export interface HostJob {
  id: string
  kind: "build" | "narrate"
  title: string
  status: "running" | "done" | "failed" | "cancelled"
  step: number
  steps: number
  stepLabel: string
  percent: number | null
  log: string[]
  error: string | null
}

export function fetchJob(): Promise<{ job: HostJob | null }> {
  return authedGet("/api/job")
}

export function startBuildJob(itemKey: string): Promise<{ job: HostJob }> {
  return authedAction(`/api/job/build/${encodeURIComponent(itemKey)}`, "POST")
}

export function startNarrateJob(itemKey: string): Promise<{ job: HostJob }> {
  return authedAction(`/api/job/narrate/${encodeURIComponent(itemKey)}`, "POST")
}

export function startRebuildJob(slug: string): Promise<{ job: HostJob }> {
  return authedAction(`/api/job/rebuild/${encodeURIComponent(slug)}`, "POST")
}

export function cancelJob(): Promise<{ job: HostJob | null }> {
  return authedAction("/api/job/cancel", "POST")
}
