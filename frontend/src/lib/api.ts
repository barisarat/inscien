// Single source of truth for the backend origin. NEXT_PUBLIC_* is inlined at build time;
// in docker compose it's always set (http://localhost:8200). If it's somehow unset we
// default to the compose host port and warn, rather than failing with a wrong default.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (console.warn("NEXT_PUBLIC_API_URL unset; defaulting to http://localhost:8200"),
    "http://localhost:8200")

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

  return `API error: ${res.status}`
}

// InScien is single-user/local with no auth — these are plain calls (the backend
// chat endpoints are unauthenticated).
async function authedGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "GET" })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  return res.json()
}

async function authedAction<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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

// Persist a completed background-skill turn (compare/write/narrate) into a chat session,
// creating it when sessionId is null. Returns the session id so the client can adopt it.
export interface ChatTurnIn {
  sessionId?: number | null
  title?: string
  userContent: string
  assistantContent?: string
  citations?: unknown[]
  widgets?: unknown[]
}

export async function saveChatTurn(body: ChatTurnIn): Promise<{ sessionId: number }> {
  return authedAction("/api/chat/turn", "POST", body)
}

// ---- Settings (model/provider + display name) ----

// InScien is local-only — no provider/cloud-key fields.
export interface AppSettings {
  displayName: string
  llmModel: string
  ollamaBaseUrl: string
}

export interface AppSettingsUpdate {
  displayName?: string
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
  value: string     // "local|<model>", e.g. "local|qwen2.5:7b" — InScien is local-only
  label: string
  provider: string  // always "local"
  model: string
}

export async function getModelOptions(): Promise<{ options: ModelOption[] }> {
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

export async function fetchZoteroCollections(): Promise<{ collections: ZoteroCollection[]; liveConnected?: boolean }> {
  return authedGet("/api/zotero/collections")
}

export async function fetchZoteroItems(collectionId: number): Promise<{ items: ZoteroItem[] }> {
  return authedGet(`/api/zotero/collections/${collectionId}/items`)
}

export async function fetchZoteroIndexableKeys(collectionId: number): Promise<{ itemKeys: string[] }> {
  return authedGet(`/api/zotero/collections/${collectionId}/indexable-keys`)
}

export async function startZoteroIndex(itemKeys: string[]): Promise<{ jobId: string }> {
  return authedAction("/api/zotero/index", "POST", { itemKeys })
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
}

export interface DiscoveryGraph {
  nodes: GraphNode[]
  edges: { from: string; to: string }[]
  unmapped: string[]
  noDoi: string[]
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

// itemKeys that already have a cached OpenAlex map (navigator 'mapped' dot).
export async function mappedKeys(): Promise<{ keys: string[] }> {
  return authedGet("/api/graph/mapped-keys")
}

// ---- Compare (cross-paper grounded comparison table, background job) ----

// One grounded cell: a short value bound to a page-precise citation (or "Not reported"
// with no citation when the paper doesn't state it).
export interface CompareCitation {
  title: string
  url?: string
  sourceId?: string
  page?: number | null
  passage?: string
}

export interface CompareCell {
  value: string
  citation: CompareCitation | null
}

export interface CompareResult {
  dimensions: string[]
  papers: { docId: string; title: string }[]
  // cells[docId][dimension] -> CompareCell
  cells: Record<string, Record<string, CompareCell>>
  synthesis: string
}

export interface CompareStatus {
  id: string
  status: "queued" | "running" | "done" | "error"
  stage?: string
  progress?: number
  detail?: string
  error?: string
  result?: CompareResult | null
}

// Phase 1: fast, synchronous — propose the comparison dimensions for the user to confirm.
export async function proposeCompare(docIds: string[]): Promise<{ dimensions: string[] }> {
  return authedAction("/api/compare/propose", "POST", { docIds })
}

// Phase 2: kick off the long per-cell grounded extraction as a background job.
export async function startCompare(
  docIds: string[],
  dimensions: string[],
): Promise<{ jobId: string }> {
  return authedAction("/api/compare", "POST", { docIds, dimensions })
}

export async function getCompare(jobId: string): Promise<CompareStatus> {
  return authedGet(`/api/compare/${encodeURIComponent(jobId)}`)
}

// ---- Write (agentic literature-review pipeline, background job) ----

export interface WriteResult {
  answer: string          // markdown draft (prose + ## References)
  citations: LabCitationDTO[]
}

// Doc-level citation carried by a finished draft (shape matches the chat citation).
export interface LabCitationDTO {
  title: string
  url?: string
  sourceId?: string
  sourceType?: string
  contentMode?: string
  page?: number | null
  passage?: string
}

export interface WriteStatus {
  id: string
  status: "queued" | "running" | "done" | "error"
  stage?: string
  progress?: number
  detail?: string
  error?: string
  result?: WriteResult | null
}

// Phase 1: top-N candidate papers + proposed extraction dimensions, for the user to confirm.
export async function proposePlan(
  topic: string,
): Promise<{ papers: PaperItem[]; dimensions: string[] }> {
  return authedAction("/api/write/plan", "POST", { topic })
}

// Phase 2: run the extract→compare→synthesize→write pipeline as a background job.
export async function startWriteup(
  topic: string,
  docIds: string[],
  dimensions: string[],
): Promise<{ jobId: string }> {
  return authedAction("/api/write", "POST", { topic, docIds, dimensions })
}

export async function getWriteup(jobId: string): Promise<WriteStatus> {
  return authedGet(`/api/write/${encodeURIComponent(jobId)}`)
}
