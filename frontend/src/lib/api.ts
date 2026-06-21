const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface CourseListItem {
  id: string
  name: string
  href: string
  desc: string
}

export interface CourseGroup {
  category: string
  items: CourseListItem[]
}

export interface CourseGroupsResponse {
  courseGroups: CourseGroup[]
}

export interface CourseLecturePart {
  id: string
  title: string
  videoId: string
  completed: boolean
}

export interface CourseLecture {
  id: string
  title: string
  parts: CourseLecturePart[]
}

export interface CourseDetail {
  id: string
  slug: string
  name: string
  category: string
  desc: string
  source: string
  href: string
  lectures: CourseLecture[]
}

export interface CoursePartProgressResponse {
  courseId: string
  partId: string
  completed: boolean
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    })

    if (!res.ok) return null

    const data: unknown = await res.json()

    if (
      typeof data === "object" &&
      data !== null &&
      "access" in data &&
      typeof data.access === "string"
    ) {
      return data.access
    }

    return null
  } catch {
    return null
  }
}

async function fetchWithOptionalAuth(url: string): Promise<Response> {
  const access = localStorage.getItem("financelab_access")
  const refresh = localStorage.getItem("financelab_refresh")

  if (!access) {
    return fetch(url, {
      cache: "no-store",
    })
  }

  const firstRes = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${access}`,
    },
  })

  if (firstRes.status !== 401 || !refresh) {
    return firstRes
  }

  const newAccess = await refreshAccessToken(refresh)

  if (!newAccess) {
    localStorage.removeItem("financelab_access")
    localStorage.removeItem("financelab_refresh")

    return fetch(url, {
      cache: "no-store",
    })
  }

  localStorage.setItem("financelab_access", newAccess)

  return fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${newAccess}`,
    },
  })
}

async function fetchWithRequiredAuth(url: string, init: RequestInit): Promise<Response> {
  let access = localStorage.getItem("financelab_access")
  const refresh = localStorage.getItem("financelab_refresh")

  if (!access && refresh) {
    const newAccess = await refreshAccessToken(refresh)

    if (newAccess) {
      localStorage.setItem("financelab_access", newAccess)
      access = newAccess
    }
  }

  if (!access) throw new Error("Not authenticated")

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${access}`)

  const firstRes = await fetch(url, {
    ...init,
    headers,
  })

  if (firstRes.status !== 401 || !refresh) {
    return firstRes
  }

  const newAccess = await refreshAccessToken(refresh)

  if (!newAccess) {
    localStorage.removeItem("financelab_access")
    localStorage.removeItem("financelab_refresh")
    throw new Error("Not authenticated")
  }

  localStorage.setItem("financelab_access", newAccess)

  const retryHeaders = new Headers(init.headers)
  retryHeaders.set("Authorization", `Bearer ${newAccess}`)

  return fetch(url, {
    ...init,
    headers: retryHeaders,
  })
}

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

export async function fetchCourseGroups(): Promise<CourseGroupsResponse> {
  const res = await fetch(`${API_BASE}/api/courses`, {
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)

  return res.json()
}

export async function fetchCourseDetail(courseSlug: string): Promise<CourseDetail> {
  const res = await fetchWithOptionalAuth(`${API_BASE}/api/courses/${courseSlug}`)

  if (!res.ok) throw new Error(await getErrorMessage(res))

  return res.json()
}

export async function updateCoursePartProgress(
  courseId: string,
  partId: string,
  completed: boolean
): Promise<CoursePartProgressResponse> {
  const res = await fetchWithRequiredAuth(
    `${API_BASE}/api/courses/${courseId}/parts/${encodeURIComponent(partId)}/progress`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ completed }),
    }
  )

  if (!res.ok) throw new Error(await getErrorMessage(res))

  return res.json()
}

export async function fetchAgentBrief(
  agent: string,
  day: string = "latest",
  limit: number = 30
) {
  const params = new URLSearchParams({ day, limit: String(limit) })
  const res = await fetch(`${API_BASE}/api/v1/briefs/${agent}?${params}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchNotifications(week: string = "latest", topic?: string) {
  const params = new URLSearchParams({ week })
  if (topic) params.set("topic", topic)
  const res = await fetch(`${API_BASE}/api/v1/notifications?${params}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchNotificationCount() {
  const res = await fetch(`${API_BASE}/api/v1/notifications/count`, {
    cache: "no-store",
  })
  if (!res.ok) {
    return {
      count: 0,
      weekly_count: 0,
      analysis_count: 0,
      techmap_count: 0,
      week_end: "",
      latest_event_date: "",
      techmap_week_end: "",
    }
  }
  return res.json()
}

export async function fetchNotificationWeeks() {
  const res = await fetch(`${API_BASE}/api/v1/notifications/weeks`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchAnalysisEvents(
  date: string = "recent",
  ticker?: string,
  days: number = 7
) {
  const params = new URLSearchParams({ date, days: String(days) })
  if (ticker) params.set("ticker", ticker)
  const res = await fetch(`${API_BASE}/api/v1/notifications/analysis?${params}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export async function fetchTechmapHighlights(weeks: number = 1) {
  const params = new URLSearchParams({ weeks: String(weeks) })
  const res = await fetch(`${API_BASE}/api/v1/notifications/techmaps?${params}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export interface TrackDownloadInput {
  notebook_id: string
  notebook_name: string
  notebook_category: string
  notebook_desc: string
  file_basename: string
}

export async function trackDownload(payload: TrackDownloadInput): Promise<{
  ok: boolean
  quota: {
    used: number
    limit: number | null
    remaining: number | null
    can_download: boolean
  }
}> {
  const access = localStorage.getItem("financelab_access")
  if (!access) throw new Error("Not authenticated")

  const res = await fetch(`${API_BASE}/api/v1/downloads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access}`,
    },
    body: JSON.stringify(payload),
  })

  if (res.status === 429) {
    const data = await res.json()
    throw new Error(data.detail || "Monthly download limit reached")
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`)

  return res.json()
}

export async function updateMarketingOptIn(marketingOptIn: boolean): Promise<{
  detail: string
}> {
  const access = localStorage.getItem("financelab_access")
  if (!access) throw new Error("Not authenticated")

  const res = await fetch(`${API_BASE}/api/marketing-opt-in`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access}`,
    },
    body: JSON.stringify({
      marketing_opt_in: marketingOptIn,
    }),
  })

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}))
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof data.detail === "string"
        ? data.detail
        : `API error: ${res.status}`

    throw new Error(detail)
  }

  return res.json()
}

// --- Signal tests / backtests / live runs ---------------------------------------

export interface PaperRun {
  id: number
  signalTestId: number | null
  ticker: string
  rule: string
  params: Record<string, number>
  frequency: string
  status: string
  startingCash: number | null
  cash: number | null
  positionQty: number | null
  positionAvgPrice: number | null
  lastPrice: number | null
  equity: number | null
  realizedPnl: number | null
  returnPct: number | null
  note: string
  lastTickAt: string | null
  startedAt: string | null
  stoppedAt: string | null
  createdAt: string | null
}

export interface PaperRunDetail extends PaperRun {
  ticks: { ts: string; price: number; positionQty: number; equity: number }[]
  trades: { ts: string; side: string; qty: number; price: number }[]
}

export interface ActiveRunSummary {
  id: number
  status: string
  equity: number | null
  returnPct: number | null
}

// A saved validation snapshot (evidence). One per kind, overridable. `type`
// matches the chat widget kind it was captured from.
export interface ValidationSnapshot {
  type: "seriesCorrelation" | "newsBacktest" | "backtestReport" | "coverage"
  label?: string
  metrics?: Record<string, number | string>
  window?: { start: string | null; end: string | null; range: string | null }
  frequency?: string | null
  asset?: string | null
  capturedAt: string
  chart?: { ts: string; equity: number }[] | null
}

// A trading rule on a signal, traded on an asset — the testable/publishable unit.
export interface SavedSignalTest {
  id: number
  signalId: number | null
  name: string
  ticker: string
  rule: string
  threshold: number | null
  params: Record<string, number>
  frequency: string
  isPublished: boolean
  publicId: string | null
  publicPath: string | null
  createdAt: string | null
  activeRun: ActiveRunSummary | null
  // Test-level evidence (the backtest), keyed by kind, or null.
  validation: Record<string, ValidationSnapshot> | null
}

// A saved news/sentiment index with its signal-level evidence and Signal Tests.
export interface SavedSignal {
  id: number
  name: string
  signalType: string
  scope: string | null
  topicConfig: Record<string, unknown> | null
  sentimentType: string
  smoothing: number
  windowHours: number
  createdAt: string | null
  // Signal-level evidence (correlation, coverage), keyed by kind, or null.
  validation: Record<string, ValidationSnapshot> | null
  tests: SavedSignalTest[]
}

// Absolute URL for a backend-relative public API path (e.g. a strategy's publicPath).
export function publicApiUrl(path: string): string {
  return `${API_BASE}${path}`
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

export async function listSignals(): Promise<{ signals: SavedSignal[] }> {
  return authedGet("/api/signals")
}

export async function deleteSignal(id: number): Promise<{ ok: boolean }> {
  return authedAction(`/api/signals/${id}`, "DELETE")
}

export async function deleteSignalTest(testId: number): Promise<{ ok: boolean }> {
  return authedAction(`/api/signals/tests/${testId}`, "DELETE")
}

export async function listPaperRuns(): Promise<{ runs: PaperRun[] }> {
  return authedGet("/api/signals/paper-runs")
}

export async function getPaperRun(id: number): Promise<PaperRunDetail> {
  return authedGet(`/api/signals/paper-runs/${id}`)
}

// Start (or reuse) the paper run for a saved Signal Test — the Signals-page toggle.
export async function startSignalTestPaperRun(
  testId: number,
  payload?: { starting_cash?: number },
): Promise<PaperRun> {
  return authedAction(`/api/signals/tests/${testId}/paper-run`, "POST", payload)
}

export async function startPaperRun(id: number): Promise<PaperRun> {
  return authedAction(`/api/signals/paper-runs/${id}/start`, "POST")
}

export async function pausePaperRun(id: number): Promise<PaperRun> {
  return authedAction(`/api/signals/paper-runs/${id}/pause`, "POST")
}

export async function stopPaperRun(id: number): Promise<PaperRun> {
  return authedAction(`/api/signals/paper-runs/${id}/stop`, "POST")
}

export async function restartPaperRun(id: number): Promise<PaperRun> {
  return authedAction(`/api/signals/paper-runs/${id}/restart`, "POST")
}

export async function deletePaperRun(id: number): Promise<{ ok: boolean }> {
  return authedAction(`/api/signals/paper-runs/${id}`, "DELETE")
}

export async function publishSignalTest(testId: number): Promise<SavedSignalTest> {
  return authedAction(`/api/signals/tests/${testId}/publish`, "POST")
}

export async function unpublishSignalTest(testId: number): Promise<SavedSignalTest> {
  return authedAction(`/api/signals/tests/${testId}/unpublish`, "POST")
}

// --- API keys (public strategy API) ----------------------------------------------

export interface ApiKeyItem {
  id: number
  name: string
  keyPrefix: string
  createdAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

// The full secret is returned exactly once, at creation.
export interface CreatedApiKey extends ApiKeyItem {
  secret: string
}

export async function listApiKeys(): Promise<{ keys: ApiKeyItem[] }> {
  return authedGet("/api/keys")
}

export async function createApiKey(name: string): Promise<CreatedApiKey> {
  return authedAction("/api/keys", "POST", { name })
}

export async function revokeApiKey(id: number): Promise<{ ok: boolean }> {
  return authedAction(`/api/keys/${id}`, "DELETE")
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
  value: string     // "provider|model", e.g. "local|qwen2.5:7b", "openai|gpt-5.4-nano", "auto|"
  label: string
  provider: string
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

export async function fetchZoteroCollections(): Promise<{ collections: ZoteroCollection[] }> {
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
  category?: string
  sectionTitle?: string
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

// ---- Admin system monitor (read-only, admin-gated server-side) ----

export interface AdminViolation {
  key: string
  severity: "warn" | "critical"
  message: string
  value: unknown
}

export interface AdminTaskRun {
  id: number
  taskName: string
  status: "success" | "failure"
  startedAt: string | null
  finishedAt: string | null
  durationMs: number
  result: Record<string, unknown> | null
  error: string | null
}

export interface AdminTaskBoardEntry {
  taskName: string
  lastRun: AdminTaskRun | null
  lastSuccessAt: string | null
  expectedEveryHours: number | null
}

export interface AdminGdeltCoverageDay {
  day: string
  tier: "hot" | "cold" | "missing"
  rows: number | null
}

export interface AdminPaperRun {
  id: number
  ticker: string
  rule: string
  frequency: string
  status: string
  lastTickAt: string | null
  startedAt: string | null
}

export interface AdminStatus {
  checkedAt: string | null
  healthy: boolean | null
  violations: AdminViolation[]
  violationHistory: { checkedAt: string; healthy: boolean; count: number; keys: string[] }[]
  metrics: {
    gdelt?: {
      lastTileTs: string | null
      cursorLagMinutes: number | null
      lastDailyDay: string | null
      flushBoundary: string | null
      yesterdayRows: number | null
      dayCoverage: AdminGdeltCoverageDay[]
    }
    market?: Record<string, Record<string, {
      availableTo: string | null
      staleMinutes: number | null
      inWindow: boolean
    }>>
    beat?: Record<string, {
      lastSuccessAt: string | null
      ageHours: number | null
      maxAgeHours: number | null
      lastStatus: string | null
    }>
  }
  taskRuns: AdminTaskBoardEntry[]
  paperRuns: AdminPaperRun[]
  serverTime: string
}

export async function getAdminStatus(): Promise<AdminStatus> {
  return authedGet("/api/admin/status")
}

export async function getAdminTaskRuns(task?: string, limit = 50): Promise<{ runs: AdminTaskRun[] }> {
  const params = new URLSearchParams()
  if (task) params.set("task", task)
  params.set("limit", String(limit))
  return authedGet(`/api/admin/task-runs?${params.toString()}`)
}
