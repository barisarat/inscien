"use client"

import { FormEvent, KeyboardEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SendHorizontal } from "lucide-react"
import ZoteroNavigator, {
  NAV_WIDTH_COLLAPSED,
  NAV_WIDTH_EXPANDED,
} from "@/components/navigation/ZoteroNavigator"
import TopBar from "../workspace/TopBar"
import CompareMode from "../workspace/CompareMode"
import WriteMode from "../workspace/WriteMode"
import NarrateMode from "../workspace/NarrateMode"
import GraphMode from "../workspace/GraphMode"
import { useWorkspace } from "../workspace/WorkspaceProvider"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import {
  type ChatSessionSummary,
  type CompareCitation,
  type CompareResult,
  type NarrationStatus,
  type PaperItem,
  API_BASE,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
} from "@/lib/api"
import PdfViewerPanel, { type PdfTab } from "./PdfViewerPanel"
import { AnswerRenderer, CompactSources, type Citation } from "../workspace/answer/AnswerRenderer"
import pageStyles from "../ask.module.css"
import styles from "./AskClient.module.css"
import compareStyles from "./Compare.module.css"

type LabStreamEvent =
  | { type: "stage"; stage: LoadingStage; tool?: string; label?: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "delta"; text: string }
  | {
      type: "final"
      query: string
      answer: string
      citations: Citation[]
      contextSummary?: string
      sessionId?: number | null
      insufficientContext: boolean
    }
  | { type: "error"; message: string }

type LoadingStage = "thinking" | "searching" | "reading" | "drafting" | "verifying" | "tool"

type LabMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  visibleContent?: string
  citations?: Citation[]
  insufficientContext?: boolean
  isTyping?: boolean
  loadingStage?: LoadingStage
  stageLabel?: string
  streaming?: boolean
  contextSummary?: string
  // A `/write` draft — shows a Copy-as-markdown action when complete.
  draft?: boolean
  narration?: {
    jobId: string
    status: NarrationStatus["status"]
    stage?: string
    detail?: string
    progress?: number
    audioUrl?: string
    error?: string
  }
  comparison?: {
    jobId: string
    status: "queued" | "running" | "done" | "error"
    stage?: string
    detail?: string
    progress?: number
    error?: string
    papers?: PaperItem[]
    ready?: boolean
    // The finished table, stored on the message so its "View" opens THIS turn's data
    // (live and on reload), not whatever was last in the shared panel state.
    result?: CompareResult
  }
  // A `/write` literature-review job in progress (cleared and replaced by the draft on done).
  writeup?: {
    jobId: string
    status: "queued" | "running" | "done" | "error"
    stage?: string
    detail?: string
    progress?: number
    error?: string
  }
}



// Reconstruct a saved session's messages into renderable LabMessages.
function sessionMessagesToLab(
  messages: { role: string; content: string; widgets?: unknown[]; citations?: unknown[]; contextSummary?: string }[]
): LabMessage[] {
  return messages.map((m, i) => {
    const msg: LabMessage = {
      id: `restored-${i}`,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      visibleContent: m.content,
      citations: (m.citations as Citation[]) ?? [],
      contextSummary: m.contextSummary ?? "",
    }

    // Translate saved skill payloads back into the dedicated message fields so each
    // skill output rehydrates exactly as it rendered live (the `widgets` column is the
    // carrier). Unknown kinds are ignored.
    const widgets = (m.widgets ?? []) as Array<{ kind?: string } & Record<string, unknown>>
    for (const w of widgets) {
      if (w.kind === "draft") {
        msg.draft = true
      } else if (w.kind === "narration") {
        const jobId = String(w.jobId ?? "")
        msg.narration = {
          jobId,
          status: "done",
          audioUrl: `${API_BASE}/api/narrate/${encodeURIComponent(jobId)}/audio`,
        }
      } else if (w.kind === "comparison") {
        msg.comparison = {
          jobId: "",
          status: "done",
          papers: (w.papers as PaperItem[]) ?? [],
          result: w.result as CompareResult,
        }
      }
    }

    return msg
  })
}

const LOADING_STAGE_LABELS: Record<LoadingStage, string> = {
  thinking: "Thinking…",
  searching: "Searching your library…",
  reading: "Reading sources…",
  drafting: "Drafting answer…",
  verifying: "Verifying citations…",
  tool: "Working…",
}

// Use-case starters for the new-chat screen. Each chip submits a full prompt so the
// empty state demonstrates the kind of grounded, cited questions InScien answers.
const startCapabilities = [
  { label: "Summarize a paper", prompt: "Summarize the main contribution of each paper in my library, with citations." },
  { label: "Find the method", prompt: "What method or model does the paper propose, and how does it work?" },
  { label: "Compare papers", prompt: "What do these papers have in common, and where do they differ?" },
  { label: "Pull the results", prompt: "What are the key quantitative results, and on which page are they reported?" },
]

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function NarrationCard({ narration }: { narration: NonNullable<LabMessage["narration"]> }) {
  const { status, detail, stage, progress, audioUrl, error } = narration

  if (status === "error") {
    return (
      <div className={styles.warning}>
        Couldn’t generate the audio. {error || ""}
      </div>
    )
  }

  if (status === "done" && audioUrl) {
    return (
      <div className={styles.narration}>
        <div className={styles.narrationTitle}>Audio narration</div>
        <audio className={styles.narrationAudio} controls src={audioUrl} />
        <a className={styles.narrationDownload} href={audioUrl} download>
          Download mp3
        </a>
      </div>
    )
  }

  const pct = Math.max(2, Math.min(100, progress ?? 0))
  return (
    <div className={styles.narration}>
      <div className={styles.narrationStage}>{detail || stage || "Starting…"}</div>
      <div className={styles.narrationBar}>
        <div className={styles.narrationBarFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.narrationHint}>
        Generating audio in the background (a few minutes) — you can keep working.
      </div>
    </div>
  )
}

function ComparisonCard({
  comparison,
  onView,
}: {
  comparison: NonNullable<LabMessage["comparison"]>
  onView?: () => void
}) {
  const { status, detail, stage, progress, error, papers } = comparison
  const count = papers?.length ?? 0

  if (status === "error") {
    return (
      <div className={styles.warning}>
        Couldn’t build the comparison. {error || ""}
      </div>
    )
  }

  if (status === "done") {
    return (
      <div className={styles.narration}>
        <div className={styles.narrationTitle}>
          Comparison ready{count ? ` · ${count} papers` : ""}
        </div>
        <button type="button" className={compareStyles.viewBtn} onClick={onView}>
          View comparison →
        </button>
      </div>
    )
  }

  const pct = Math.max(2, Math.min(100, progress ?? 0))
  return (
    <div className={styles.narration}>
      <div className={styles.narrationStage}>{detail || stage || "Starting…"}</div>
      <div className={styles.narrationBar}>
        <div className={styles.narrationBarFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.narrationHint}>
        Comparing {count || "your"} papers cell by cell in the background — you can keep working.
      </div>
    </div>
  )
}

function WriteupCard({ writeup }: { writeup: NonNullable<LabMessage["writeup"]> }) {
  const { status, detail, stage, progress, error } = writeup

  if (status === "error") {
    return (
      <div className={styles.warning}>
        Couldn’t generate the draft. {error || ""}
      </div>
    )
  }

  const pct = Math.max(2, Math.min(100, progress ?? 0))
  return (
    <div className={styles.narration}>
      <div className={styles.narrationStage}>{detail || stage || "Starting…"}</div>
      <div className={styles.narrationBar}>
        <div className={styles.narrationBarFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.narrationHint}>
        Extracting, comparing and synthesizing across your papers, then writing — you can keep working.
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={compareStyles.copyBtn}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
      {copied ? "Copied" : "Copy as markdown"}
    </button>
  )
}

function MessageBubble({
  message,
  onOpenSource,
  onViewComparison,
}: {
  message: LabMessage
  onOpenSource?: (citation: Citation) => void
  onViewComparison?: (result?: CompareResult) => void
}) {
  if (message.role === "user") {
    return (
      <div className={`${styles.row} ${styles.rowUser}`}>
        <div className={`${styles.bubble} ${styles.bubbleUser}`}>
          {message.content}
        </div>
      </div>
    )
  }

  const text = message.visibleContent ?? message.content
  const citations = message.citations ?? []
  const isComplete = !message.streaming

  if (message.narration) {
    return (
      <div className={`${styles.row} ${styles.rowAssistant}`}>
        <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          <NarrationCard narration={message.narration} />
        </div>
      </div>
    )
  }

  if (message.comparison) {
    return (
      <div className={`${styles.row} ${styles.rowAssistant}`}>
        <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          <ComparisonCard
            comparison={message.comparison}
            onView={() => onViewComparison?.(message.comparison?.result)}
          />
        </div>
      </div>
    )
  }

  if (message.writeup) {
    return (
      <div className={`${styles.row} ${styles.rowAssistant}`}>
        <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
          <WriteupCard writeup={message.writeup} />
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.row} ${styles.rowAssistant}`}>
      <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>

        {message.isTyping ? (
          <span className={styles.loadingLabel}>
            {message.stageLabel ?? LOADING_STAGE_LABELS[message.loadingStage ?? "searching"]}
          </span>
        ) : (
          <>
            <AnswerRenderer text={text} citations={citations} onOpenSource={onOpenSource} />

            {isComplete && message.insufficientContext ? (
              <div className={styles.warning}>
                Available source context is limited for this question.
              </div>
            ) : null}

            {isComplete && message.draft ? (
              <div className={compareStyles.draftActions}>
                <CopyButton text={text} />
              </div>
            ) : null}

            {isComplete ? (
              <CompactSources citations={citations} onOpenSource={onOpenSource} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}


function AskContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQuery = searchParams.get("q")?.trim() || ""
  const sessionParam = searchParams.get("session")
  const [input, setInput] = useState(initialQuery)
  const [messages, setMessages] = useState<LabMessage[]>([])

  // Right work-panel: PDF tabs (one per doc, keyed by sourceId).
  const [pdfTabs, setPdfTabs] = useState<PdfTab[]>([])
  const [activePdfTabId, setActivePdfTabId] = useState<string | null>(null)
  // Comparison work-panel: the latest grounded table + whether its tab is showing.
  const [comparison, setComparison] = useState<CompareResult | null>(null)
  const [comparisonActive, setComparisonActive] = useState(false)

  const handleOpenSource = useCallback((citation: Citation) => {
    if (!citation.sourceId) return
    const id = citation.sourceId
    const tab: PdfTab = {
      id,
      title: citation.title || "Document",
      sourceId: id,
      targetPage: citation.page ?? 1,
      passage: citation.passage,
    }
    // Reuse an existing tab for the same doc, updating its page/passage to the new
    // citation (re-scrolls + re-highlights); otherwise open a new tab.
    setPdfTabs((prev) =>
      prev.some((t) => t.id === id) ? prev.map((t) => (t.id === id ? tab : t)) : [...prev, tab]
    )
    setActivePdfTabId(id)
    setComparisonActive(false)
  }, [])

  // Open a comparison cell's source PDF at its cited page (CompareCitation shape).
  const handleOpenComparisonSource = useCallback((c: CompareCitation) => {
    handleOpenSource({
      sourceId: c.sourceId,
      title: c.title,
      url: c.url ?? "",
      page: c.page ?? 1,
      passage: c.passage,
    })
  }, [handleOpenSource])

  const handleClosePdfTab = useCallback((id: string) => {
    // Drop the tab; if it was active, clear the id — the panel falls back to the
    // first remaining tab (and unmounts entirely once none are left).
    setPdfTabs((prev) => prev.filter((t) => t.id !== id))
    setActivePdfTabId((cur) => (cur === id ? null : cur))
  }, [])

  const handleCloseComparison = useCallback(() => {
    setComparison(null)
    setComparisonActive(false)
  }, [])

  const handleViewComparison = useCallback((result?: CompareResult) => {
    if (result) setComparison(result)
    setComparisonActive(true)
  }, [])

  const handleClosePdfPanel = useCallback(() => {
    setPdfTabs([])
    setActivePdfTabId(null)
    setComparison(null)
    setComparisonActive(false)
  }, [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    sessionParam ? Number(sessionParam) : null
  )
  const { selectedKeys } = useZoteroSelection()
  const selectedKeysRef = useRef(selectedKeys)
  useEffect(() => {
    selectedKeysRef.current = selectedKeys
  }, [selectedKeys])
  const { mode, setMode, setActiveArtifact } = useWorkspace()
  const [navCollapsed, setNavCollapsed] = useState(false)
  useEffect(() => {
    try {
      setNavCollapsed(window.sessionStorage.getItem("inscien-zotero-nav") === "0")
    } catch {}
  }, [])
  const toggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev
      try {
        window.sessionStorage.setItem("inscien-zotero-nav", next ? "0" : "1")
      } catch {}
      return next
    })
  }, [])
  const navWidth = navCollapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_EXPANDED
  const streamRef = useRef<HTMLDivElement | null>(null)
  const pageEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const submittedQueryRef = useRef("")
  // Last submitted query + its user-message id, so "Try again" can re-run it cleanly.
  const lastQueryRef = useRef("")
  const lastUserMessageIdRef = useRef("")
  const skipAutoSubmitRef = useRef(false)
  const inFlightRef = useRef(false)
  const streamAbortRef = useRef<AbortController | null>(null)
  const shouldAutoScrollRef = useRef(true)
  // Mirror of `messages` so submit can read the latest committed turns without
  // re-creating the callback (the closure would otherwise capture stale state).
  const messagesRef = useRef<LabMessage[]>([])
  const activeSessionIdRef = useRef<number | null>(activeSessionId)
  const loadedSessionRef = useRef<string | null>(null)

  const hasMessages = messages.length > 0
  const canSubmit = useMemo(() => input.trim().length >= 2 && !isLoading, [input, isLoading])
  const activeSessionTitle = useMemo(() => {
    const title = sessions.find((session) => session.id === activeSessionId)?.title?.trim()

    if (!title) return ""

    return title.charAt(0).toUpperCase() + title.slice(1)
  }, [activeSessionId, sessions])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Abort any in-flight answer stream when the component unmounts.
  useEffect(() => () => streamAbortRef.current?.abort(), [])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    document.title = activeSessionTitle ? `${activeSessionTitle} | InScien` : "InScien"
  }, [activeSessionTitle])

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions } = await listChatSessions()
      setSessions(sessions)
    } catch {
      // ignore
    }
  }, [])

  // Adopt a (possibly newly-created) session: reflect it in the URL + sidebar. Shared by
  // the Q&A final event and the background-skill save-on-completion.
  const adoptSession = useCallback((sid: number | null) => {
    if (sid && sid !== activeSessionIdRef.current) {
      activeSessionIdRef.current = sid
      loadedSessionRef.current = String(sid)
      setActiveSessionId(sid)
      router.replace(`/ask?session=${sid}`)
    }
    if (sid) void refreshSessions()
  }, [router, refreshSessions])

  // Keep the sidebar session list in sync for logged-in users.
  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  // Load a saved session when ?session changes (logged-in reconstruction).
  useEffect(() => {
    if (!sessionParam) {
      // New chat / no session selected.
      if (loadedSessionRef.current !== null) {
        loadedSessionRef.current = null
        setMessages([])
        setActiveSessionId(null)
      }
      return
    }
    if (loadedSessionRef.current === sessionParam) return

    loadedSessionRef.current = sessionParam
    const id = Number(sessionParam)
    setActiveSessionId(id)
    void (async () => {
      try {
        const detail = await getChatSession(id)
        const run = detectRun(detail.messages)
        if (run?.kind === "comparison") {
          setMode("compare")
          setActiveArtifact({
            kind: "comparison",
            sessionId: id,
            result: run.result,
            papers: run.papers,
            dimensions: run.dimensions,
          })
        } else if (run?.kind === "writeup") {
          setMode("write")
          setActiveArtifact({ kind: "writeup", sessionId: id, answer: run.answer, citations: run.citations })
        } else {
          setMode("ask")
          setMessages(sessionMessagesToLab(detail.messages))
        }
      } catch {
        setError("Could not load that chat.")
      }
    })()
  }, [sessionParam])

  useEffect(() => {
    const node = streamRef.current

    if (!node || !shouldAutoScrollRef.current) return

    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    })

    window.requestAnimationFrame(() => {
      pageEndRef.current?.scrollIntoView({
        block: "end",
        behavior: isLoading ? "smooth" : "auto",
      })
    })
  }, [messages, isLoading])

  useEffect(() => {
    function updateAutoScrollIntent() {
      const streamNode = streamRef.current
      const streamRemaining = streamNode
        ? streamNode.scrollHeight - streamNode.scrollTop - streamNode.clientHeight
        : 0
      const viewportRemaining =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight

      shouldAutoScrollRef.current = streamRemaining < 180 && viewportRemaining < 220
    }

    window.addEventListener("scroll", updateAutoScrollIntent, { passive: true })

    return () => window.removeEventListener("scroll", updateAutoScrollIntent)
  }, [])

  useEffect(() => {
    const node = textareaRef.current

    if (!node) return

    node.style.height = "auto"
    node.style.height = `${Math.min(node.scrollHeight, 148)}px`
  }, [input])

  const submitQuestion = useCallback(async (nextQuery?: string) => {
    const finalQuery = (nextQuery ?? input).trim()

    if (finalQuery.length < 2) {
      setError("Please enter a question.")
      return
    }

    // Hard guard against duplicate submissions while a request is in flight.
    if (inFlightRef.current) return
    inFlightRef.current = true

    const userMessage: LabMessage = {
      id: makeMessageId("user"),
      role: "user",
      content: finalQuery,
    }
    // Remember the query + its bubble so a failed turn can be retried cleanly.
    lastQueryRef.current = finalQuery
    lastUserMessageIdRef.current = userMessage.id

    const assistantId = makeMessageId("assistant")
    const loadingMessage: LabMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isTyping: true,
      loadingStage: "thinking",
    }

    shouldAutoScrollRef.current = true
    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setInput("")
    setIsLoading(true)
    setError("")

    const updateAssistant = (patch: Partial<LabMessage>) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, ...patch } : message
        )
      )
    }

    let accumulated = ""
    let started = false
    let finalized = false


    const handleEvent = (payload: LabStreamEvent) => {
      if (payload.type === "stage") {
        // Server may send a dynamic label (e.g. "computing QQQ volatility");
        // fall back to the static stage label when absent.
        updateAssistant({ loadingStage: payload.stage, stageLabel: payload.label })
        return
      }

      if (payload.type === "citations") {
        // Arrives before the first delta; lets inline chips and Sources render
        // live during streaming rather than popping in at the end.
        updateAssistant({ citations: payload.citations })
        return
      }

      if (payload.type === "delta") {
        accumulated += payload.text

        if (!started) {
          started = true
          updateAssistant({
            isTyping: false,
            streaming: true,
            content: accumulated,
            visibleContent: accumulated,
          })
        } else {
          updateAssistant({ content: accumulated, visibleContent: accumulated })
        }
        return
      }

      if (payload.type === "final") {
        finalized = true
        updateAssistant({
          isTyping: false,
          streaming: false,
          content: payload.answer,
          visibleContent: payload.answer,
          citations: payload.citations,
          contextSummary: payload.contextSummary,
          insufficientContext: payload.insufficientContext,
        })
        adoptSession(payload.sessionId ?? null)
        return
      }

      if (payload.type === "error") {
        throw new Error(payload.message || "Something went wrong.")
      }
    }

    const controller = new AbortController()
    streamAbortRef.current = controller

    try {
      const response = await fetch(`${API_BASE}/api/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query: finalQuery,
          session_id: activeSessionIdRef.current ?? undefined,
          item_keys:
            selectedKeysRef.current.size > 0 ? Array.from(selectedKeysRef.current) : undefined,
        }),
      })

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "")
        throw new Error(text || `Request failed with status ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let separator = buffer.indexOf("\n\n")
        while (separator !== -1) {
          const frame = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          separator = buffer.indexOf("\n\n")

          const dataLine = frame
            .split("\n")
            .find((line) => line.startsWith("data:"))

          if (!dataLine) continue

          const json = dataLine.slice(5).trim()
          if (!json) continue

          let payload: LabStreamEvent
          try {
            payload = JSON.parse(json) as LabStreamEvent
          } catch {
            continue
          }

          handleEvent(payload)
        }
      }

      // Stream ended without an explicit final frame.
      if (!finalized) {
        if (accumulated) {
          updateAssistant({ isTyping: false, streaming: false })
        } else {
          throw new Error("No response received.")
        }
      }
    } catch (nextError) {
      // User aborted (New chat / unmount) — not an error; leave the fresh state alone.
      if (controller.signal.aborted) return
      // Keep the conversation; drop only the failed assistant placeholder.
      setMessages((prev) => prev.filter((message) => message.id !== assistantId))
      setError(nextError instanceof Error ? nextError.message : "Something went wrong.")
    } finally {
      // Only clear shared state if this is still the active stream — a newer submit
      // (after an abort) may already own streamAbortRef.
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null
        setIsLoading(false)
        inFlightRef.current = false
      }
    }
  }, [input, adoptSession])

  useEffect(() => {
    if (!initialQuery) {
      skipAutoSubmitRef.current = false
      return
    }

    // A saved session takes precedence over a ?q auto-submit.
    if (sessionParam) return

    if (skipAutoSubmitRef.current) return

    if (submittedQueryRef.current === initialQuery) return

    submittedQueryRef.current = initialQuery
    void submitQuestion(initialQuery)
    // Clear ?q so a later reload doesn't resubmit this as a duplicate turn.
    router.replace("/ask")
  }, [initialQuery, sessionParam, submitQuestion, router])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitQuestion()
  }

  function handleRetry() {
    if (isLoading || !lastQueryRef.current) return
    // Drop the failed question bubble (mirror included so anonymous history stays
    // clean), then re-run it — submitQuestion re-adds it with a fresh assistant turn.
    const failedId = lastUserMessageIdRef.current
    messagesRef.current = messagesRef.current.filter((m) => m.id !== failedId)
    setMessages((prev) => prev.filter((m) => m.id !== failedId))
    setError("")
    void submitQuestion(lastQueryRef.current)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return

    event.preventDefault()

    if (canSubmit) {
      void submitQuestion()
    }
  }

  function handleNewSearch() {
    // Abort any in-flight answer stream and free the composer immediately, so a new
    // chat can start even mid-answer (the aborted stream's finally may not have run yet).
    streamAbortRef.current?.abort()
    inFlightRef.current = false
    setIsLoading(false)

    setMode("ask")
    shouldAutoScrollRef.current = true
    skipAutoSubmitRef.current = true
    submittedQueryRef.current = initialQuery
    loadedSessionRef.current = null
    setInput("")
    setMessages([])
    setError("")
    setActiveSessionId(null)
    activeSessionIdRef.current = null
    router.replace("/ask")
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleRenameSession = useCallback(async (sessionId: number, currentTitle: string) => {
    const next = window.prompt("Rename chat", currentTitle)?.trim()
    if (!next) return
    try {
      await renameChatSession(sessionId, next)
      await refreshSessions()
    } catch {
      setError("Could not rename the chat.")
    }
  }, [refreshSessions])

  const handleDeleteSession = useCallback(async (sessionId: number) => {
    if (!window.confirm("Delete this chat?")) return
    try {
      await deleteChatSession(sessionId)
      await refreshSessions()
      if (sessionId === activeSessionIdRef.current) {
        handleNewSearch()
      }
    } catch {
      setError("Could not delete the chat.")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSessions])

  return (
    <div className={pageStyles.pageShell}>
      <TopBar
        mode={mode}
        onChange={setMode}
        brandWidth={Math.max(navWidth, 160)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNew={handleNewSearch}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
        onOpenHistory={refreshSessions}
      />

      <ZoteroNavigator
        collapsed={navCollapsed}
        onToggleCollapse={toggleNav}
        leftOffset={0}
        topOffset={52}
      />

      <div
        className={pageStyles.mainContent}
        style={{ marginLeft: navWidth, paddingTop: 52 }}
      >
        {mode === "ask" ? (
        <div className={`${pageStyles.page} ${pdfTabs.length > 0 || comparison ? pageStyles.pageSplit : ""}`}>
          <main className={`${pageStyles.main} ${hasMessages ? pageStyles.mainChat : ""} ${pdfTabs.length > 0 || comparison ? pageStyles.mainSplit : ""}`}>
            <section className={`${styles.chatShell} ${hasMessages ? styles.hasMessages : styles.isEmpty}`}>
              {!hasMessages ? (
                <header className={`${pageStyles.header} ${pageStyles.headerHero}`}>
                  <h1 className={pageStyles.title}>
                    Ask your research library
                  </h1>
                  <p className={pageStyles.desc}>
                    Ask anything about your papers. InScien answers from your own documents with page-precise, verifiable citations.
                  </p>
                </header>
              ) : null}

              {hasMessages ? (
                <div
                  ref={streamRef}
                  className={styles.chatScroll}
                  onScroll={() => {
                    const node = streamRef.current
                    if (!node) return

                    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
                    shouldAutoScrollRef.current = remaining < 180
                  }}
                >
                  <div className={styles.chatStream}>
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        onOpenSource={handleOpenSource}
                        onViewComparison={handleViewComparison}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className={styles.errorBox} role="alert">
                  <span>{error}</span>
                  {lastQueryRef.current ? (
                    <div className={styles.errorActions}>
                      <button
                        type="button"
                        className={styles.retryButton}
                        onClick={handleRetry}
                        disabled={isLoading}
                      >
                        Try again
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}



              <form onSubmit={handleSubmit} className={styles.composer}>
                <div className={styles.composerInputShell}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    className={styles.composerTextarea}
                    placeholder={
                      hasMessages
                        ? "Ask a follow-up about your papers…"
                        : "Ask anything about your research papers…"
                    }
                    rows={1}
                  />

                  <button
                    type="submit"
                    className={styles.composerSend}
                    disabled={!canSubmit}
                    aria-label="Send message"
                  >
                    <SendHorizontal size={17} strokeWidth={2} aria-hidden />
                  </button>
                </div>

                {!hasMessages ? (
                  <div className={styles.examples}>
                    {startCapabilities.map((cap) => (
                      <button
                        key={cap.label}
                        type="button"
                        className={styles.exampleButton}
                        onClick={() => void submitQuestion(cap.prompt)}
                        disabled={isLoading}
                      >
                        <span className={styles.exampleLabel}>{cap.label}</span>
                        <span className={styles.examplePrompt}>{cap.prompt}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </form>

              {hasMessages ? (
                <div className={styles.composerEndNote}>
                  InScien is an AI and can make mistakes. Check the cited passages.
                </div>
              ) : null}
              <div ref={pageEndRef} className={styles.composerEndAnchor} aria-hidden />
            </section>
          </main>

          {pdfTabs.length > 0 || comparison ? (
            <PdfViewerPanel
              tabs={pdfTabs}
              activeTabId={activePdfTabId}
              onSelectTab={(id) => {
                setActivePdfTabId(id)
                setComparisonActive(false)
              }}
              onCloseTab={handleClosePdfTab}
              onClosePanel={handleClosePdfPanel}
              comparison={comparison}
              comparisonActive={comparisonActive}
              onSelectComparison={handleViewComparison}
              onCloseComparison={handleCloseComparison}
              onOpenComparisonSource={handleOpenComparisonSource}
            />
          ) : null}

        </div>
        ) : mode === "compare" ? (
          <CompareMode />
        ) : mode === "write" ? (
          <WriteMode />
        ) : mode === "narrate" ? (
          <NarrateMode />
        ) : (
          <GraphMode />
        )}
      </div>
    </div>
  )
}

export default function AskClient() {
  return (
    <Suspense fallback={null}>
      <AskContent />
    </Suspense>
  )
}
