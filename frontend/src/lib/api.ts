// Single source of truth for the backend origin. NEXT_PUBLIC_* is inlined at build time.
// Empty string = same-origin: the production image serves the API and the static UI from
// one process, so requests use relative `/api/...` paths and the bundle is port-agnostic.
// In dev the frontend (:3200) and backend (:8200) are separate origins, so the dev compose
// sets NEXT_PUBLIC_API_URL to the backend URL.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

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
// — turn it into an actionable message that names the likely cause.
const BACKEND_UNREACHABLE = `Couldn't reach the InScien backend${API_BASE ? ` at ${API_BASE}` : ""}. Is it running?`

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error(BACKEND_UNREACHABLE)
  }
}

// InScien is single-user/local with no auth — these are plain calls (the backend
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

// --- Chat sessions -------------------------------------------------------------

export interface ChatSessionSummary {
  id: number
  title: string
  createdAt: string | null
  updatedAt: string | null
}

export interface ChatMessageDTO {
  role: "user" | "assistant"
  content: string
  widgets: unknown[]
  citations: unknown[]
  contextSummary: string
  createdAt: string | null
}

export interface ChatSessionDetail {
  id: number
  title: string
  messages: ChatMessageDTO[]
}

export async function listChatSessions(): Promise<{ sessions: ChatSessionSummary[] }> {
  return authedGet("/api/chat/sessions")
}

export async function getChatSession(id: number): Promise<ChatSessionDetail> {
  return authedGet(`/api/chat/sessions/${id}`)
}

export async function renameChatSession(id: number, title: string): Promise<ChatSessionSummary> {
  return authedAction(`/api/chat/sessions/${id}`, "PATCH", { title })
}

export async function deleteChatSession(id: number): Promise<{ ok: boolean }> {
  return authedAction(`/api/chat/sessions/${id}`, "DELETE")
}

// ---- Settings (provider/model + display name) ----

// Local by default; "openai" is opt-in. The OpenAI key is env-only (OPENAI_API_KEY) — never
// sent through the API; the backend only reports whether it's present.
export interface AppSettings {
  displayName: string
  llmProvider: string          // "local" | "openai"
  llmModel: string
  ollamaBaseUrl: string
  openAiApiKeyPresent: boolean
}

export interface AppSettingsUpdate {
  displayName?: string
  llmProvider?: string
  llmModel?: string
  ollamaBaseUrl?: string
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
  indexedCount?: number
}

export interface ZoteroItem {
  itemKey: string
  title: string | null
  authors: string[]
  year: string | null
  itemType: string | null
  isBookDefaultOff: boolean
  indexed: boolean
}

export interface ZoteroIndexJob {
  id: string
  status: "queued" | "running" | "done" | "error"
  stage: string
  progress: number
  detail?: string
  error?: string
  result?: { indexed: number; skipped: number; skippedNoPdf: number; totalChunks: number }
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

// Every indexed itemKey — the Map's "whole library" scope.
export async function fetchIndexedKeys(): Promise<{ itemKeys: string[] }> {
  return authedGet("/api/zotero/indexed-keys")
}

export async function fetchZoteroIndexableKeys(collectionId: number): Promise<{ itemKeys: string[] }> {
  return authedGet(`/api/zotero/collections/${collectionId}/indexable-keys`)
}

export async function startZoteroIndex(itemKeys: string[]): Promise<{ jobId: string }> {
  return authedAction("/api/zotero/index", "POST", { itemKeys })
}

export async function reconcileZotero(): Promise<{
  pruned: number
  removed?: string[]
  skipped?: boolean
  reason?: string
}> {
  return authedAction("/api/zotero/reconcile", "POST")
}

export async function getZoteroIndexJob(jobId: string): Promise<ZoteroIndexJob> {
  return authedGet(`/api/zotero/index/${encodeURIComponent(jobId)}`)
}

export async function fetchZoteroSyncState(): Promise<{ indexedKeys: string[]; count: number }> {
  return authedGet("/api/zotero/sync-state")
}

export async function startNarration(
  opts: { query?: string; docId?: string },
): Promise<{ jobId: string; title?: string }> {
  return authedAction("/api/narrate", "POST", opts)
}

export async function getNarration(jobId: string): Promise<NarrationStatus> {
  return authedGet(`/api/narrate/${encodeURIComponent(jobId)}`)
}

// The in-progress (queued/running) narration for a paper, or null — used to re-attach to
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

// ---- Literature discovery graph (OpenAlex, selection-scoped) ----

export interface GraphNode {
  id: string
  label: string
  type: "owned" | "external"
  year?: string | number | null
  date?: string | null // OpenAlex publication_date (YYYY-MM-DD) — drives the timeline x-axis
  citedBy?: number | null // external: within-selection degree (shared anchors render bigger)
  globalCitedBy?: number | null // global OpenAlex cited-by count
  doi?: string | null
  collection?: string | null // owned: Zotero collection, for grouping/color
}

export interface DiscoveryGraph {
  nodes: GraphNode[]
  edges: { from: string; to: string }[]
  unmapped: string[]
  noDoi: string[]
}

// ---- Map · the Atlas (one fused graph over your own papers) ----
// Blends semantic similarity + direct citation + bibliographic coupling, clustered via Louvain.

export interface FusedNode {
  id: string
  label: string
  type: "owned"
  cluster: number
  clusterLabel?: string | null
  collection?: string | null
  authors?: string[]
  year?: string | number | null
  date?: string | null
  doi?: string | null
  globalCitedBy?: number | null
  mapped: boolean // false = has a vector but no OpenAlex record yet (semantic-only node)
}

export interface FusedEdge {
  source: string
  target: string
  weight: number
  semantic: number // rescaled cosine contribution (0 if below the floor)
  coupling: number // bibliographic-coupling / co-citation contribution
  citation: { direct: boolean; direction: "AtoB" | "BtoA" | "both" | null }
}

export interface FusedCluster {
  id: number
  label?: string | null
  size: number
}

export interface FusedMap {
  nodes: FusedNode[]
  edges: FusedEdge[]
  clusters: FusedCluster[]
  missing: string[] // in-scope items with no paper vector yet (not indexed)
  unmapped: string[] // mapped on the graph but lacking an OpenAlex record (semantic-only)
}

export async function fetchFusedMap(itemKeys: string[]): Promise<FusedMap> {
  return authedAction("/api/map", "POST", { itemKeys })
}

export interface GraphFetchStatus {
  mapped: string[]
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
  result?: { mapped: string[] } | null
}

// Pre-fetch coverage of a selection — how many papers already have a cached map.
export async function graphFetchStatus(itemKeys: string[]): Promise<GraphFetchStatus> {
  return authedAction("/api/graph/fetch-status", "POST", { itemKeys })
}

// Kick off the OpenAlex reference fetch for the unmapped papers as a background job.
export async function startGraphFetch(itemKeys: string[]): Promise<{ jobId: string }> {
  return authedAction("/api/graph/fetch", "POST", { itemKeys })
}

export async function getGraphFetch(jobId: string): Promise<GraphFetchJob> {
  return authedGet(`/api/graph/fetch/${encodeURIComponent(jobId)}`)
}

// Assemble the discovery map over the mapped subset of the selection.
export async function fetchDiscoveryGraph(itemKeys: string[]): Promise<DiscoveryGraph> {
  return authedAction("/api/graph", "POST", { itemKeys })
}

// Cited-by (forward): works that cite your papers. Fetch is a background job (polled via
// getGraphFetch — same runner); the graph is assembled from the cache.
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
