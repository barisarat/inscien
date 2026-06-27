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

// InScien is single-user/local with no auth - these are plain calls (the backend
// chat endpoints are unauthenticated).
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

// ---- Settings (provider/model + display name) ----

// Local by default; "openai" is opt-in. The OpenAI key is env-only (OPENAI_API_KEY) - never
// sent through the API; the backend only reports whether it's present.
export interface AppSettings {
  displayName: string
  llmProvider: string          // "local" | "openai"
  llmModel: string
  ollamaBaseUrl: string
  zoteroDataDir: string
  openAiApiKeyPresent: boolean
}

export interface AppSettingsUpdate {
  displayName?: string
  llmProvider?: string
  llmModel?: string
  ollamaBaseUrl?: string
  zoteroDataDir?: string
  openAiApiKey?: string         // write-only; only sent when the user enters a new key
}

export async function getSettings(): Promise<AppSettings> {
  return authedGet("/api/settings")
}

export async function updateSettings(body: AppSettingsUpdate): Promise<AppSettings> {
  return authedAction("/api/settings", "PUT", body)
}

export interface ModelOption {
  value: string     // "local|<model>", e.g. "local|qwen2.5:7b"
  label: string
  provider: string  // "local" (cloud models are free-text, not enumerated)
  model: string
}

export async function getModelOptions(): Promise<{
  options: ModelOption[]
  ollamaReachable: boolean
  cloudModelHint?: string
}> {
  return authedGet("/api/settings/models")
}

// ---- Narration (paper -> audio, background job) ----

export interface NarrationStatus {
  id: string
  title?: string
  status: "queued" | "running" | "done" | "error"
  stage?: string
  progress?: number
  detail?: string
  error?: string
  durationMin?: number
  faithfulness?: string
}

export interface PaperItem {
  docId: string
  title: string
}

export async function listPapers(): Promise<{ papers: PaperItem[] }> {
  return authedGet("/api/papers")
}

// ---- Zotero-native library (collections, items, indexing) ----

export interface ZoteroCollection {
  collectionID: number
  key: string
  name: string
  parentCollectionID: number | null
  children: ZoteroCollection[]
  itemCount?: number
}

export interface ZoteroItem {
  itemKey: string
  title: string | null
  authors: string[]
  year: string | null
  itemType: string | null
  isBookDefaultOff: boolean
  doi: string | null
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

export async function fetchZoteroIndexableKeys(collectionId: number): Promise<{ itemKeys: string[] }> {
  return authedGet(`/api/zotero/collections/${collectionId}/indexable-keys`)
}

export async function reconcileZotero(): Promise<{
  pruned: number
  removed?: string[]
  skipped?: boolean
  reason?: string
}> {
  return authedAction("/api/zotero/reconcile", "POST")
}

export async function startNarration(
  opts: { query?: string; docId?: string },
): Promise<{ jobId: string; title?: string }> {
  return authedAction("/api/narrate", "POST", opts)
}

export async function getNarration(jobId: string): Promise<NarrationStatus> {
  return authedGet(`/api/narrate/${encodeURIComponent(jobId)}`)
}

// The in-progress (queued/running) narration for a paper, or null - used to re-attach to
// a narration started before the user navigated away.
export async function activeNarration(docId: string): Promise<{ job: NarrationStatus | null }> {
  return authedGet(`/api/narrate/active?docId=${encodeURIComponent(docId)}`)
}

export interface NarrationRegistryItem {
  docId: string
  jobId: string
  title: string
  audioUrl: string
}

export async function listNarrations(): Promise<{ items: NarrationRegistryItem[] }> {
  return authedGet("/api/narrate/registry")
}

// TTS (Kokoro) weights: present-check + a one-time download job (the desktop build doesn't bundle
// them). Reuses the NarrationStatus job shape for progress polling.
export async function getNarrateModel(): Promise<{ present: boolean }> {
  return authedGet("/api/narrate/model")
}

export async function startNarrateModelDownload(): Promise<{ jobId: string }> {
  return authedAction("/api/narrate/model/download", "POST")
}

export async function getNarrateModelDownload(jobId: string): Promise<NarrationStatus> {
  return authedGet(`/api/narrate/model/download/${encodeURIComponent(jobId)}`)
}

// ---- Literature discovery graph (OpenAlex, selection-scoped) ----

export interface GraphNode {
  id: string
  label: string
  type: "owned" | "external"
  year?: string | number | null
  date?: string | null // OpenAlex publication_date (YYYY-MM-DD) - drives the timeline x-axis
  citedBy?: number | null // external: within-selection degree (shared anchors render bigger)
  globalCitedBy?: number | null // global OpenAlex cited-by count
  doi?: string | null
  collection?: string | null // owned: Zotero collection path, for grouping/color
}

export interface DiscoveryGraph {
  nodes: GraphNode[]
  edges: { from: string; to: string }[]
  unmapped: string[]
  noDoi: string[]
}

export interface GraphFetchJob {
  id: string
  status: "queued" | "running" | "done" | "error"
  stage?: string
  progress?: number
  detail?: string
  error?: string
  result?: Record<string, unknown> | null
}

// Kick off the OpenAlex reference fetch for the unmapped papers as a background job.
export async function startGraphFetch(itemKeys: string[]): Promise<{ jobId: string }> {
  return authedAction("/api/graph/fetch", "POST", { itemKeys })
}

export async function getGraphFetch(jobId: string): Promise<GraphFetchJob> {
  return authedGet(`/api/graph/fetch/${encodeURIComponent(jobId)}`)
}

// Cancel a selection fetch whose papers are no longer shown (frees the single worker).
export async function cancelGraphFetch(jobId: string): Promise<{ ok: boolean }> {
  return authedAction(`/api/graph/cancel/${encodeURIComponent(jobId)}`, "POST")
}

// How many DOI-bearing papers still need a citation fetch (drives the opt-in "Fetch citations (N)").
export async function prefetchStatus(): Promise<{ pending: number; total: number }> {
  return authedGet("/api/graph/prefetch-status")
}

// Id of an in-flight whole-library prefetch (or null) - lets the UI resume its progress on reload.
export async function activeFetch(): Promise<{ jobId: string | null }> {
  return authedGet("/api/graph/active")
}

// Whole-library citation prefetch (references + citers for DOI-bearing items) as one background
// job. Idempotent (returns the running job if one exists). Poll via getGraphFetch.
export async function startLibraryPrefetch(): Promise<{ jobId: string; count: number }> {
  return authedAction("/api/graph/prefetch", "POST")
}

// Assemble the citation graph over the mapped subset of the selection.
export async function fetchDiscoveryGraph(itemKeys: string[]): Promise<DiscoveryGraph> {
  return authedAction("/api/graph", "POST", { itemKeys })
}

// Cited-by (forward): works that cite your papers. Fetch is a background job (polled via
// getGraphFetch - same runner); the graph is assembled from the cache.
export async function startCitingFetch(itemKeys: string[]): Promise<{ jobId: string }> {
  return authedAction("/api/graph/citing-fetch", "POST", { itemKeys })
}

export async function fetchCitingGraph(itemKeys: string[]): Promise<DiscoveryGraph> {
  return authedAction("/api/graph/citing", "POST", { itemKeys })
}

// itemKeys that already have a cached OpenAlex map (navigator 'mapped' dot).
export async function mappedKeys(): Promise<{ keys: string[] }> {
  return authedGet("/api/graph/mapped-keys")
}
