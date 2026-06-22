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
  API_BASE,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
  type ChatSessionSummary,
  type CompareResult,
} from "@/lib/api"
import PdfViewerPanel from "./PdfViewerPanel"
import { AnswerRenderer, CompactSources, type Citation } from "../workspace/answer/AnswerRenderer"
import pageStyles from "../ask.module.css"
import styles from "./AskClient.module.css"

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
      verification?: { grounded: boolean; unsupported: string[]; checkSkipped?: boolean }
    }
  | { type: "error"; message: string; code?: string; retryable?: boolean }

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
  verificationSkipped?: boolean
}



// Reconstruct a saved session's plain chat messages into renderable LabMessages. Skill runs
// (compare/write) are not chat — they are intercepted by detectRun and reopened in their
// workspace tab, so a session reaching here carries no skill widgets.
function sessionMessagesToLab(
  messages: { role: string; content: string; citations?: unknown[]; contextSummary?: string }[]
): LabMessage[] {
  return messages.map((m, i) => ({
    id: `restored-${i}`,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    visibleContent: m.content,
    citations: (m.citations as Citation[]) ?? [],
    contextSummary: m.contextSummary ?? "",
  }))
}

// Detect a saved skill run from its persisted widgets so the session-load effect can reopen
// it in the matching workspace tab (Compare/Write) instead of rendering it as chat.
function detectRun(messages: { widgets?: unknown[] }[]):
  | { kind: "comparison"; result: CompareResult; papers: { docId: string; title: string }[]; dimensions: string[] }
  | { kind: "writeup"; answer: string; citations: unknown[] }
  | null {
  for (const m of messages) {
    for (const w of (m.widgets || []) as Array<Record<string, unknown>>) {
      if (w?.kind === "comparison" && w.result) {
        const result = w.result as CompareResult
        return {
          kind: "comparison",
          result,
          papers: (w.papers as { docId: string; title: string }[]) || result.papers || [],
          dimensions: (w.dimensions as string[]) || result.dimensions || [],
        }
      }
      if (w?.kind === "writeup" && w.answer != null) {
        return { kind: "writeup", answer: String(w.answer), citations: (w.citations as unknown[]) || [] }
      }
    }
  }
  return null
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

// After this many ms with no stream events, show a soft "still working" hint so a slow
// local model doesn't look like a frozen spinner. Non-fatal — the backend request timeout
// governs actual failure.
const IDLE_HINT_MS = 45_000
const IDLE_HINT_LABEL = "Still working — local models can be slow on the first answer…"

// Error codes (from the backend `error` event) that a Settings change can resolve.
const SETTINGS_ERROR_CODES = new Set(["ollama_unreachable", "model_missing", "timeout"])

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function MessageBubble({
  message,
  onOpenSource,
}: {
  message: LabMessage
  onOpenSource?: (citation: Citation) => void
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

            {isComplete && message.verificationSkipped ? (
              <div className={styles.warning}>
                Grounding check couldn&apos;t run — this answer wasn&apos;t verified against
                the sources.
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [errorCode, setErrorCode] = useState("")
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    sessionParam ? Number(sessionParam) : null
  )
  const { selectedKeys } = useZoteroSelection()
  const selectedKeysRef = useRef(selectedKeys)
  useEffect(() => {
    selectedKeysRef.current = selectedKeys
  }, [selectedKeys])
  const {
    mode,
    setMode,
    openPdf,
    pdfTabs,
    activePdfTabId,
    hasOpenPdf,
    selectPdfTab,
    closePdfTab,
    closePdfPanel,
    setActiveArtifact,
  } = useWorkspace()
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
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldAutoScrollRef = useRef(true)
  // Mirror of `messages` so submit can read the latest committed turns without
  // re-creating the callback (the closure would otherwise capture stale state).
  const messagesRef = useRef<LabMessage[]>([])
  const activeSessionIdRef = useRef<number | null>(activeSessionId)
  const loadedSessionRef = useRef<string | null>(null)

  const hasMessages = messages.length > 0
  // A question must be scoped to at least one selected paper (the sidebar selection is the
  // retrieval scope); the Send button + Enter stay disabled until something is selected.
  const canSubmit = useMemo(
    () => input.trim().length >= 2 && !isLoading && selectedKeys.size > 0,
    [input, isLoading, selectedKeys],
  )
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

    // A question must be scoped to selected papers (the retrieval scope).
    if (selectedKeysRef.current.size === 0) {
      setError("Select one or more papers in the sidebar before asking.")
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
    setErrorCode("")

    const updateAssistant = (patch: Partial<LabMessage>) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId ? { ...message, ...patch } : message
        )
      )
    }

    // Soft "still working" hint: (re)armed on every stream event; fires only after a long
    // silence so a slow local model doesn't read as a frozen spinner.
    const bumpIdleHint = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        updateAssistant({ stageLabel: IDLE_HINT_LABEL })
      }, IDLE_HINT_MS)
    }
    const clearIdleHint = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }

    let accumulated = ""
    let started = false
    let finalized = false
    let streamErrorCode = ""


    const handleEvent = (payload: LabStreamEvent) => {
      // Any event means the backend is alive — re-arm the idle hint.
      bumpIdleHint()

      if (payload.type === "stage") {
        // Server may send a dynamic label (e.g. "searching 12 papers");
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
        clearIdleHint()
        updateAssistant({
          isTyping: false,
          streaming: false,
          content: payload.answer,
          visibleContent: payload.answer,
          citations: payload.citations,
          contextSummary: payload.contextSummary,
          insufficientContext: payload.insufficientContext,
          verificationSkipped: payload.verification?.checkSkipped ?? false,
        })
        adoptSession(payload.sessionId ?? null)
        return
      }

      if (payload.type === "error") {
        streamErrorCode = payload.code ?? ""
        throw new Error(payload.message || "Something went wrong.")
      }

      // Unknown event type — ignore it (forward-compatible) but make the drop visible in
      // the console instead of failing silently.
      console.warn("Ignoring unknown stream event type:", (payload as { type?: string }).type)
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
            // Drop the malformed frame but make it visible rather than silent.
            console.warn("Dropping malformed SSE frame:", json)
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
      setErrorCode(streamErrorCode)
    } finally {
      clearIdleHint()
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

    // canSubmit gates on `isLoading` (state, lags a tick); also check the in-flight ref
    // (set synchronously) so a rapid double-Enter can't slip a second submit through.
    if (canSubmit && !inFlightRef.current) {
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
        <div className={`${pageStyles.page} ${hasOpenPdf ? pageStyles.pageSplit : ""}`}>
          {mode === "ask" ? (
          <main className={`${pageStyles.main} ${hasMessages ? pageStyles.mainChat : ""} ${hasOpenPdf ? pageStyles.mainSplit : ""}`}>
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
                        onOpenSource={openPdf}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className={styles.errorBox} role="alert">
                  <span>{error}</span>
                  {lastQueryRef.current || SETTINGS_ERROR_CODES.has(errorCode) ? (
                    <div className={styles.errorActions}>
                      {lastQueryRef.current ? (
                        <button
                          type="button"
                          className={styles.retryButton}
                          onClick={handleRetry}
                          disabled={isLoading}
                        >
                          Try again
                        </button>
                      ) : null}
                      {SETTINGS_ERROR_CODES.has(errorCode) ? (
                        <a className={styles.errorSettingsLink} href="/settings">
                          Open Settings
                        </a>
                      ) : null}
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

                {selectedKeys.size === 0 ? (
                  <div className={styles.composerHint}>
                    Select one or more papers in the sidebar to ask a question.
                  </div>
                ) : null}

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
          ) : (
            <div className={`${pageStyles.modeContent} ${hasOpenPdf ? pageStyles.modeContentSplit : ""}`}>
              {mode === "compare" ? (
                <CompareMode />
              ) : mode === "write" ? (
                <WriteMode />
              ) : mode === "narrate" ? (
                <NarrateMode />
              ) : (
                <GraphMode />
              )}
            </div>
          )}

          {hasOpenPdf ? (
            <PdfViewerPanel
              tabs={pdfTabs}
              activeTabId={activePdfTabId}
              onSelectTab={selectPdfTab}
              onCloseTab={closePdfTab}
              onClosePanel={closePdfPanel}
            />
          ) : null}
        </div>
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
