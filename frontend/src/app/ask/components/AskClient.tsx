"use client"

import { FormEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronRight, ExternalLink, SendHorizontal, X } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import AppSidebar from "@/components/navigation/AppSidebar"
import { useSidebar } from "@/lib/SidebarProvider"
import { useAuth } from "@/lib/auth"
import { type ContextItem } from "@/lib/useChatSidebar"
import {
  type ChatSessionSummary,
  type CompareCitation,
  type CompareResult,
  type NarrationStatus,
  type PaperItem,
  deleteChatSession,
  getChatSession,
  getCompare,
  getNarration,
  getWriteup,
  listChatSessions,
  listPapers,
  proposeCompare,
  proposePlan,
  renameChatSession,
  saveChatTurn,
  startCompare,
  startNarration,
  startWriteup,
} from "@/lib/api"
import PdfViewerPanel, { type PdfTab } from "./PdfViewerPanel"
import { type GraphData } from "./GraphView"
import pageStyles from "../ask.module.css"
import styles from "./AskClient.module.css"
import compareStyles from "./Compare.module.css"

type LabCitation = {
  title: string
  url: string
  sourceId?: string
  sourceType: string
  category: string
  sectionTitle: string
  contentMode: string
  // Page-precise citation surface (InScien): the page the passage was on, and the
  // exact retrieved passage text so the Sources list can reveal it on click.
  page?: number | null
  passage?: string
}


type LabStreamEvent =
  | { type: "stage"; stage: LoadingStage; tool?: string; label?: string }
  | { type: "citations"; citations: LabCitation[] }
  | { type: "delta"; text: string }
  | { type: "graph"; nodes: GraphData["nodes"]; edges: GraphData["edges"] }
  | { type: "refs"; matches: RefMatch[] }
  | {
      type: "final"
      query: string
      answer: string
      citations: LabCitation[]
      contextSummary?: string
      sessionId?: number | null
      related: LabCitation[]
      retrievedCount: number
      insufficientContext: boolean
    }
  | { type: "error"; message: string }

type RefMatch = {
  paperDocId: string
  paperTitle: string
  reference: { title: string; authors?: string; year?: string; doi?: string }
  inCorpus: boolean
  matchedDocId?: string | null
}

type LoadingStage = "thinking" | "searching" | "reading" | "drafting" | "verifying" | "tool"

type LabMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  visibleContent?: string
  citations?: LabCitation[]
  related?: LabCitation[]
  retrievedCount?: number
  insufficientContext?: boolean
  isTyping?: boolean
  loadingStage?: LoadingStage
  stageLabel?: string
  streaming?: boolean
  contextSummary?: string
  refResults?: RefMatch[]
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
  // A `/graph` turn's citation map, so its "View citation map" reopens this turn's graph.
  graphData?: GraphData
}


type CodeToken = {
  text: string
  className: string
}

type TokenPattern = {
  pattern: RegExp
  className: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const LAB_ANONYMOUS_ID_KEY = "financelab_lab_anonymous_id"
const MAX_HISTORY_MESSAGES = 16

type ChatHistoryItem = { role: "user" | "assistant"; content: string }

// Serialize prior completed turns for the backend (anonymous chats only — logged-in
// chats build history server-side from the saved session). Assistant turns fold in
// the compact tool recap so follow-ups resolve; widget payloads are never sent.
function buildChatHistory(messages: LabMessage[]): ChatHistoryItem[] {
  const items: ChatHistoryItem[] = []

  for (const message of messages) {
    if (message.isTyping || message.streaming) continue

    const text = (message.visibleContent ?? message.content ?? "").trim()
    if (!text) continue

    if (message.role === "assistant") {
      const recap = message.contextSummary ? `\n\n(context: ${message.contextSummary})` : ""
      items.push({ role: "assistant", content: text + recap })
    } else {
      items.push({ role: "user", content: text })
    }
  }

  return items.slice(-MAX_HISTORY_MESSAGES)
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
      citations: (m.citations as LabCitation[]) ?? [],
      contextSummary: m.contextSummary ?? "",
    }

    // Translate saved skill payloads back into the dedicated message fields so each
    // skill output rehydrates exactly as it rendered live (the `widgets` column is the
    // FinanceLab-style carrier). Unknown kinds are ignored.
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
      } else if (w.kind === "graph") {
        msg.graphData = {
          nodes: (w.nodes as GraphData["nodes"]) ?? [],
          edges: (w.edges as GraphData["edges"]) ?? [],
        }
      } else if (w.kind === "refs") {
        msg.refResults = (w.matches as RefMatch[]) ?? []
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

const PYTHON_TOKENS: TokenPattern[] = [
  {
    pattern: /\b(from|import|def|with|as|if|return|True|False|None|and|or|not|in|is|for|while|class|pass|raise|try|except|finally|yield|lambda|global|nonlocal|del|assert|break|continue|elif|else)\b/g,
    className: "kw",
  },
  {
    pattern: /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g,
    className: "str",
  },
  {
    pattern: /#.*/g,
    className: "comment",
  },
  {
    pattern: /\b(__name__|__main__)\b/g,
    className: "special",
  },
  {
    pattern: /\b\d+(\.\d+)?\b/g,
    className: "num",
  },
  {
    pattern: /\b([a-z_][a-zA-Z0-9_]*)\s*(?=\()/g,
    className: "fn",
  },
]

const BASH_TOKENS: TokenPattern[] = [
  {
    pattern: /#.*/g,
    className: "comment",
  },
  {
    pattern: /\b(git|cd|cp|touch|nano|grep|source|chmod|docker|python|jupyter|pip|sudo|mkdir|rm|mv|cat|ls|curl|wget|systemctl|journalctl)\b/g,
    className: "fn",
  },
  {
    pattern: /\b(clone|add|commit|push|pull|fetch|branch|remote|show-ref|set-url|restore|clean|switch|status|compose|logs|exec|build|up|down|restart|start|stop|install|run)\b/g,
    className: "fn",
  },
  {
    pattern: /(--mirror|--bare|--show-current|--track|--tail|--follow|--no-input|--execute|--to|--output-dir|-u|-v|-a|-m|-f|-d|-fd|-fdn|-c|-lc|-s|-S)\b/g,
    className: "kw",
  },
  {
    pattern: /(https?:\/\/[^\s]+)/g,
    className: "str",
  },
  {
    pattern: /\b(origin|HEAD|true|false|null)\b/g,
    className: "special",
  },
  {
    pattern: /('[^']*'|"[^"]*")/g,
    className: "str",
  },
]

const JSON_TOKENS: TokenPattern[] = [
  {
    pattern: /"[^"\\]*(?:\\.[^"\\]*)*"(?=\s*:)/g,
    className: "kw",
  },
  {
    pattern: /"[^"\\]*(?:\\.[^"\\]*)*"/g,
    className: "str",
  },
  {
    pattern: /\b(true|false|null)\b/g,
    className: "special",
  },
  {
    pattern: /\b\d+(\.\d+)?\b/g,
    className: "num",
  },
]

const SQL_TOKENS: TokenPattern[] = [
  {
    pattern: /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|ALTER|DROP|AND|OR|NOT|NULL|IS|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX)\b/gi,
    className: "kw",
  },
  {
    pattern: /('[^']*'|"[^"]*")/g,
    className: "str",
  },
  {
    pattern: /--.*/g,
    className: "comment",
  },
  {
    pattern: /\b\d+(\.\d+)?\b/g,
    className: "num",
  },
]

// Use-case starters for the new-chat screen. Each chip submits a full prompt so the
// empty state demonstrates the kind of grounded, cited questions InScien answers.
const startCapabilities = [
  { label: "Summarize a paper", prompt: "Summarize the main contribution of each paper in my library, with citations." },
  { label: "Find the method", prompt: "What method or model does the paper propose, and how does it work?" },
  { label: "Compare papers", prompt: "What do these papers have in common, and where do they differ?" },
  { label: "Pull the results", prompt: "What are the key quantitative results, and on which page are they reported?" },
]

function buildAskPath(query: string) {
  return `/ask?q=${encodeURIComponent(query)}`
}

function createAnonymousId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getLabAnonymousId() {
  if (typeof window === "undefined") return ""

  const existing = window.localStorage.getItem(LAB_ANONYMOUS_ID_KEY)

  if (existing) return existing

  const nextId = createAnonymousId()
  window.localStorage.setItem(LAB_ANONYMOUS_ID_KEY, nextId)

  return nextId
}

function buildLabRequestHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  const anonymousId = getLabAnonymousId()

  if (anonymousId) {
    headers["X-Lab-Anonymous-Id"] = anonymousId
  }

  if (typeof window !== "undefined") {
    const access = window.localStorage.getItem("financelab_access")

    if (access) {
      headers.Authorization = `Bearer ${access}`
    }
  }

  return headers
}

function sourceLabel(sourceType: string) {
  switch (sourceType) {
    case "doc":
      return "Doc"
    case "notebook":
      return "Notebook"
    case "paper":
      return "Paper"
    case "paper_topic":
      return "Paper topic"
    case "course":
      return "Course"
    case "course_lecture":
      return "Course lecture"
    case "podcast":
      return "Podcast"
    case "podcast_episode":
      return "Podcast episode"
    case "book":
      return "Book"
    case "book_topic":
      return "Book topic"
    case "glossary":
      return "Glossary"
    case "ai_tool":
      return "AI/ML tool"
    default:
      return sourceType
  }
}

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getTokenSet(language: string) {
  const normalized = language.toLowerCase()

  if (normalized === "bash" || normalized === "sh" || normalized === "shell" || normalized === "zsh") {
    return BASH_TOKENS
  }

  if (normalized === "json") {
    return JSON_TOKENS
  }

  if (normalized === "sql") {
    return SQL_TOKENS
  }

  return PYTHON_TOKENS
}

function tokenizeCode(code: string, language: string): CodeToken[] {
  const tokenSet = getTokenSet(language)
  type Span = { start: number; end: number; className: string }
  const spans: Span[] = []

  for (const { pattern, className } of tokenSet) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
    let match: RegExpExecArray | null

    while ((match = re.exec(code)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        className,
      })
    }
  }

  spans.sort((a, b) => a.start - b.start || b.end - a.end)

  const accepted: Span[] = []
  let cursor = 0

  for (const span of spans) {
    if (span.start >= cursor) {
      accepted.push(span)
      cursor = span.end
    }
  }

  const tokens: CodeToken[] = []
  let position = 0

  for (const span of accepted) {
    if (span.start > position) {
      tokens.push({
        text: code.slice(position, span.start),
        className: "plain",
      })
    }

    tokens.push({
      text: code.slice(span.start, span.end),
      className: span.className,
    })

    position = span.end
  }

  if (position < code.length) {
    tokens.push({
      text: code.slice(position),
      className: "plain",
    })
  }

  return tokens
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

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  const tokens = useMemo(() => tokenizeCode(code, language), [code, language])

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className={styles.codeBlock}>
      <button
        type="button"
        className={`${styles.codeCopyBtn} ${copied ? styles.iconBtnActive : ""}`}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>

      <div className={styles.codeBlockHeader}>
        {language || "text"}
      </div>

      <pre className={styles.pre}>
        <code>
          {tokens.map((token, index) => (
            <span key={`${token.className}-${index}`} className={styles[token.className as keyof typeof styles] ?? ""}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

// Marker class set on citation link nodes by the remark plugin below so the
// `a` component override can route them through next/link with citation styling.
const CITATION_CLASS = "lab-citation"

const isExternalUrl = (url: string) => /^https?:\/\//i.test(url)

// Slash commands shown in the composer menu. `insert` ends with a space so picking it
// closes the menu (and, for /graph, is immediately submittable with no argument).
// `/ask` (plain Q&A) is just typing without a slash, so the menu shows only the two
// distinctive skills. The backend still understands `/ask` if typed.
const SLASH_COMMANDS = [
  { cmd: "/write", insert: "/write ", desc: "Draft a grounded, cited synthesis on a topic" },
  { cmd: "/compare", insert: "/compare ", desc: "Compare papers side by side in a grounded table" },
  { cmd: "/graph", insert: "/graph ", desc: "Map how your papers cite each other" },
  { cmd: "/refs", insert: "/refs ", desc: "Find which papers cite a title or DOI" },
  { cmd: "/narrate", insert: "/narrate ", desc: "Narrate a paper as audio" },
]

// A leading `/command` routes deterministically to a skill; anything else is plain
// NL that the agent routes itself. `/graph` needs no argument.
function parseSkill(text: string): { skill?: string; query: string } {
  const m = /^\/(\w+)\s*([\s\S]*)$/.exec(text)
  if (!m) return { query: text }
  const cmd = m[1].toLowerCase()
  const rest = m[2].trim()
  if (cmd === "graph") return { skill: "graph", query: rest || "Show the citation map of my library." }
  if (cmd === "refs") return { skill: "refs", query: rest || text }
  if (cmd === "narrate") return { skill: "narrate", query: rest || text }
  if (cmd === "compare") return { skill: "compare", query: rest || text }
  if (cmd === "write") return { skill: "write", query: rest || text }
  if (cmd === "ask") return { skill: "ask", query: rest || text }
  return { query: text } // unknown command — treat as ordinary text
}

// Absolute URL to the source PDF, opened at the cited page via the `#page=N`
// fragment (the browser's native PDF viewer honors it). Empty if not a PDF source.
function pdfHref(citation: LabCitation): string {
  if (!citation.sourceId) return ""
  const page = citation.page ?? 1
  return `${API_BASE}/api/papers/${encodeURIComponent(citation.sourceId)}#page=${page}`
}

// Routes a citation/source link: external http(s) targets open in a new tab,
// internal routes use next/link. Shared by the inline chip and the Sources rows.
function CitationLink({
  href,
  className,
  ariaLabel,
  title,
  onClick,
  children,
}: {
  href: string
  className?: string
  ariaLabel?: string
  title?: string
  onClick?: (e: ReactMouseEvent) => void
  children: ReactNode
}) {
  if (isExternalUrl(href)) {
    // href is kept so middle/ctrl-click still opens the browser tab; onClick (when
    // provided) intercepts a plain left-click to open the in-app viewer instead.
    return (
      <a
        href={href}
        className={className}
        aria-label={ariaLabel}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} aria-label={ariaLabel} title={title} onClick={onClick}>
      {children}
    </Link>
  )
}

// Remark plugin: rewrite `[n]` markers in text nodes into mdast link nodes
// pointing at citations[n-1]. Runs on the parsed tree (after remark-gfm), so it
// survives nesting inside lists, bold, etc. `[n]` inside code is untouched because
// code/inlineCode are not `text` nodes and have no children to walk.
function createCitationPlugin(citations: LabCitation[]) {
  // mdast nodes are typed as `any` here — react-markdown's PluggableList is
  // strict and we don't depend on @types/mdast.
  function splitTextNode(value: string): unknown[] {
    const parts: unknown[] = []
    const regex = /\[(\d+)\]/g
    let last = 0
    let match = regex.exec(value)

    while (match) {
      if (match.index > last) {
        parts.push({ type: "text", value: value.slice(last, match.index) })
      }

      const citationNumber = Number(match[1])
      const citation = citations[citationNumber - 1]

      if (citation) {
        const pageLabel = citation.page != null ? ` (p. ${citation.page})` : ""
        parts.push({
          type: "link",
          url: pdfHref(citation) || citation.url,
          data: {
            hProperties: {
              className: [CITATION_CLASS],
              title: `${citation.title}${pageLabel}`,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          },
          children: [{ type: "text", value: `${citationNumber}` }],
        })
      } else {
        parts.push({ type: "text", value: match[0] })
      }

      last = regex.lastIndex
      match = regex.exec(value)
    }

    if (last < value.length) {
      parts.push({ type: "text", value: value.slice(last) })
    }

    return parts
  }

  function visit(node: any) {
    if (!node || !Array.isArray(node.children)) return

    const next: unknown[] = []
    for (const child of node.children) {
      if (child?.type === "text" && typeof child.value === "string" && /\[\d+\]/.test(child.value)) {
        next.push(...splitTextNode(child.value))
      } else {
        visit(child)
        next.push(child)
      }
    }
    node.children = next
  }

  return () => (tree: any) => {
    visit(tree)
  }
}

function buildMarkdownComponents(
  citations: LabCitation[],
  onOpenSource?: (citation: LabCitation) => void,
): Components {
  return {
  code({ className, children }) {
    const text = String(children ?? "")
    const language = /language-(\w+)/.exec(className || "")?.[1]
    // Fenced/block code has a language class or spans multiple lines; everything
    // else is inline. (react-markdown v9 dropped the `inline` prop.)
    if (language || text.includes("\n")) {
      return <CodeBlock code={text.replace(/\n$/, "")} language={language || "text"} />
    }
    return <code className={styles.inlineCode}>{children}</code>
  },
  // CodeBlock (from the `code` override) renders its own <pre>; unwrap the
  // default <pre> wrapper to avoid nested <pre> and extra UA styling.
  pre: ({ children }) => <>{children}</>,
  h1: ({ children }) => <h3 className={styles.answerHeading}>{children}</h3>,
  h2: ({ children }) => <h3 className={styles.answerHeading}>{children}</h3>,
  h3: ({ children }) => <h3 className={styles.answerHeading}>{children}</h3>,
  h4: ({ children }) => <h3 className={styles.answerHeading}>{children}</h3>,
  p: ({ children }) => <p className={styles.answerParagraph}>{children}</p>,
  ul: ({ children }) => <ul className={styles.answerList}>{children}</ul>,
  ol: ({ children, start }) => (
    <ol className={styles.answerList} start={start}>
      {children}
    </ol>
  ),
  strong: ({ children }) => <strong className={styles.answerStrong}>{children}</strong>,
  em: ({ children }) => <em className={styles.answerEm}>{children}</em>,
  a({ className, href, title, children }) {
    const isCitation = typeof className === "string" && className.includes(CITATION_CLASS)
    if (href && isCitation) {
      // The link's visible text IS the citation number, so map back to the citation
      // and (when a handler is provided) open it in the in-app viewer on left-click.
      const idx = Number(String(children))
      const citation = Number.isFinite(idx) ? citations[idx - 1] : undefined
      return (
        <CitationLink
          href={href}
          title={title}
          ariaLabel={`Source ${String(children)}${title ? `, ${title}` : ""}`}
          className={`${styles.numberChip} ${styles.citationChip}`}
          onClick={
            citation && onOpenSource
              ? (e) => {
                  e.preventDefault()
                  onOpenSource(citation)
                }
              : undefined
          }
        >
          {children}
        </CitationLink>
      )
    }
    return (
      <a href={href} title={title} className={styles.answerLink} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  },
  }
}

function AnswerRenderer({
  text,
  citations,
  onOpenSource,
}: {
  text: string
  citations: LabCitation[]
  onOpenSource?: (citation: LabCitation) => void
}) {
  const remarkPlugins = useMemo(
    () => [remarkGfm, createCitationPlugin(citations)],
    [citations]
  )
  const components = useMemo(
    () => buildMarkdownComponents(citations, onOpenSource),
    [citations, onOpenSource]
  )

  return (
    <div className={styles.answerText}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function CompactSources({
  citations,
  onOpenSource,
}: {
  citations: LabCitation[]
  onOpenSource?: (citation: LabCitation) => void
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (citations.length === 0) return null

  return (
    <section className={styles.compactSources}>
      <div className={styles.compactSourcesTitle}>Sources</div>
      <div className={styles.compactSourceList}>
        {citations.map((citation, index) => {
          const expanded = openIndex === index
          const pageLabel = citation.page != null ? `p. ${citation.page}` : null

          const pdf = pdfHref(citation)

          return (
            <div key={`${citation.url}-${citation.page ?? ""}-${index}`}>
              <div className={styles.compactSourceRow}>
                <button
                  type="button"
                  className={styles.compactSourceLink}
                  onClick={() => setOpenIndex(expanded ? null : index)}
                  aria-expanded={expanded}
                  aria-label={`Source ${index + 1}: ${citation.title}${pageLabel ? `, ${pageLabel}` : ""}`}
                >
                  <span className={styles.numberChip}>{index + 1}</span>
                  <span className={styles.compactSourceText}>
                    {citation.title}
                    {pageLabel ? <span className={styles.compactSourcePage}> · {pageLabel}</span> : null}
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={1.5}
                    className={styles.compactSourceArrow}
                    style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                    aria-hidden
                  />
                </button>
                {pdf ? (
                  <a
                    className={styles.compactSourceOpen}
                    href={pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open the PDF${pageLabel ? ` at ${pageLabel}` : ""}`}
                    aria-label={`Open ${citation.title}${pageLabel ? ` at ${pageLabel}` : ""}`}
                    onClick={
                      onOpenSource
                        ? (e) => {
                            e.preventDefault()
                            onOpenSource(citation)
                          }
                        : undefined
                    }
                  >
                    <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
                  </a>
                ) : null}
              </div>
              {expanded && citation.passage ? (
                <blockquote className={styles.passage}>{citation.passage}</blockquote>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
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
  onViewGraph,
}: {
  message: LabMessage
  onOpenSource?: (citation: LabCitation) => void
  onViewComparison?: (result?: CompareResult) => void
  onViewGraph?: (data: GraphData) => void
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

            {isComplete && message.graphData ? (
              <div className={compareStyles.draftActions}>
                <button
                  type="button"
                  className={compareStyles.viewBtn}
                  onClick={() => message.graphData && onViewGraph?.(message.graphData)}
                >
                  View citation map →
                </button>
              </div>
            ) : null}

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

            {isComplete && message.refResults && message.refResults.length > 0 ? (
              <RefResults matches={message.refResults} onOpenSource={onOpenSource} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function RefResults({
  matches,
  onOpenSource,
}: {
  matches: RefMatch[]
  onOpenSource?: (citation: LabCitation) => void
}) {
  return (
    <section className={styles.compactSources}>
      <div className={styles.compactSourcesTitle}>Found in these papers</div>
      <div className={styles.compactSourceList}>
        {matches.map((m, index) => (
          <button
            key={`${m.paperDocId}-${index}`}
            type="button"
            className={styles.compactSourceLink}
            title={m.reference.title}
            onClick={() =>
              onOpenSource?.({
                sourceId: m.paperDocId,
                title: m.paperTitle,
                url: "",
                sourceType: "pdf",
                category: "",
                sectionTitle: "",
                contentMode: "full_text",
                page: 1,
              })
            }
          >
            <span className={styles.numberChip}>{index + 1}</span>
            <span className={styles.compactSourceText}>
              {m.paperTitle}
              <span className={styles.compactSourcePage}> · cites “{m.reference.title.slice(0, 60)}”</span>
            </span>
            {m.inCorpus ? <span className={styles.numberChip}>in library</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}


function AskContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const initialQuery = searchParams.get("q")?.trim() || ""
  const sessionParam = searchParams.get("session")
  const [input, setInput] = useState(initialQuery)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  // Inline paper picker for `/narrate <filter>`.
  const [papers, setPapers] = useState<PaperItem[]>([])
  const papersLoadedRef = useRef(false)
  const [paperIndex, setPaperIndex] = useState(0)
  const [paperDismissed, setPaperDismissed] = useState(false)
  // Multi-select picker + confirm flow for `/compare <filter>`.
  const [compareSelection, setCompareSelection] = useState<PaperItem[]>([])
  const [compareIndex, setCompareIndex] = useState(0)
  const [compareDismissed, setCompareDismissed] = useState(false)
  // The dimension-confirm card: papers chosen + the proposed (editable) dimensions.
  const [comparePrompt, setComparePrompt] = useState<{
    papers: PaperItem[]
    dimensions: string[]
    status: "proposing" | "confirming" | "error"
    error?: string
  } | null>(null)
  const [dimDraft, setDimDraft] = useState("")
  // `/write` confirm card: topic + auto-selected papers (toggle) + proposed (editable) dimensions.
  const [writePrompt, setWritePrompt] = useState<{
    topic: string
    papers: PaperItem[]
    dimensions: string[]
    status: "planning" | "confirming" | "error"
    error?: string
  } | null>(null)
  const [writeDimDraft, setWriteDimDraft] = useState("")
  const [writeScope, setWriteScope] = useState<string[]>([])  // selected docIds for the review
  const [messages, setMessages] = useState<LabMessage[]>([])

  // Right work-panel: PDF tabs (one per doc, keyed by sourceId) + an optional
  // citation-graph tab.
  const [pdfTabs, setPdfTabs] = useState<PdfTab[]>([])
  const [activePdfTabId, setActivePdfTabId] = useState<string | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [graphActive, setGraphActive] = useState(false)
  // Comparison work-panel: the latest grounded table + whether its tab is showing.
  const [comparison, setComparison] = useState<CompareResult | null>(null)
  const [comparisonActive, setComparisonActive] = useState(false)

  const handleOpenSource = useCallback((citation: LabCitation) => {
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
    setGraphActive(false) // opening a doc (incl. a graph-node click) shows the PDF
    setComparisonActive(false)
  }, [])

  // Open a comparison cell's source PDF at its cited page (CompareCitation shape).
  const handleOpenComparisonSource = useCallback((c: CompareCitation) => {
    handleOpenSource({
      sourceId: c.sourceId,
      title: c.title,
      url: c.url ?? "",
      sourceType: "pdf",
      category: "",
      sectionTitle: "",
      contentMode: "full_text",
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

  const handleCloseGraph = useCallback(() => {
    setGraph(null)
    setGraphActive(false)
  }, [])

  const handleCloseComparison = useCallback(() => {
    setComparison(null)
    setComparisonActive(false)
  }, [])

  const handleViewComparison = useCallback((result?: CompareResult) => {
    if (result) setComparison(result)
    setComparisonActive(true)
    setGraphActive(false)
  }, [])

  const handleViewGraph = useCallback((data: GraphData) => {
    setGraph(data)
    setGraphActive(true)
    setComparisonActive(false)
  }, [])

  const handleClosePdfPanel = useCallback(() => {
    setPdfTabs([])
    setActivePdfTabId(null)
    setGraph(null)
    setGraphActive(false)
    setComparison(null)
    setComparisonActive(false)
  }, [])
  const [isLoading, setIsLoading] = useState(false)
  const [answerIsComplete, setAnswerIsComplete] = useState(false)
  const [error, setError] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    sessionParam ? Number(sessionParam) : null
  )
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const streamRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const pageEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const submittedQueryRef = useRef("")
  // Last submitted query + its user-message id, so "Try again" can re-run it cleanly.
  const lastQueryRef = useRef("")
  const lastUserMessageIdRef = useRef("")
  const skipAutoSubmitRef = useRef(false)
  const inFlightRef = useRef(false)
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

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    document.title = activeSessionTitle ? `${activeSessionTitle} | InScien` : "InScien"
  }, [activeSessionTitle])

  const refreshSessions = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([])
      return
    }
    try {
      const { sessions } = await listChatSessions()
      setSessions(sessions)
    } catch {
      // ignore
    }
  }, [isAuthenticated])

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
        setAnswerIsComplete(false)
      }
      return
    }
    if (!isAuthenticated) return
    if (loadedSessionRef.current === sessionParam) return

    loadedSessionRef.current = sessionParam
    const id = Number(sessionParam)
    setActiveSessionId(id)
    void (async () => {
      try {
        const detail = await getChatSession(id)
        setMessages(sessionMessagesToLab(detail.messages))
        setAnswerIsComplete(true)
      } catch {
        setError("Could not load that chat.")
      }
    })()
  }, [sessionParam, isAuthenticated])

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

  // Narration is a multi-minute BACKGROUND job (not the SSE chat flow): start it,
  // release the composer, and poll a card. Reused by typed `/narrate` and the picker.
  const startNarrationJob = useCallback(
    async (opts: { docId?: string; query?: string; userText: string }) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      const userMessage: LabMessage = {
        id: makeMessageId("user"),
        role: "user",
        content: opts.userText,
      }
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
      setError("")

      const updateAssistant = (patch: Partial<LabMessage>) => {
        setMessages((current) =>
          current.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
        )
      }

      let jobId = ""
      let narrationTitle = opts.userText
      try {
        const res = await startNarration({ docId: opts.docId, query: opts.query })
        jobId = res.jobId
        narrationTitle = res.title || opts.userText
        updateAssistant({ isTyping: false, narration: { jobId, status: "queued" } })
      } catch (err) {
        updateAssistant({
          isTyping: false,
          narration: { jobId: "", status: "error", error: String(err) },
        })
        inFlightRef.current = false
        return
      }
      setAnswerIsComplete(true)
      inFlightRef.current = false

      const poll = async () => {
        try {
          const s = await getNarration(jobId)
          updateAssistant({
            narration: {
              jobId,
              status: s.status,
              stage: s.stage,
              detail: s.detail,
              progress: s.progress,
              audioUrl: s.status === "done" ? `${API_BASE}/api/narrate/${jobId}/audio` : undefined,
              error: s.error,
            },
          })
          if (s.status === "done") {
            try {
              const saved = await saveChatTurn({
                sessionId: activeSessionIdRef.current,
                title: opts.userText,
                userContent: opts.userText,
                widgets: [{ kind: "narration", jobId, title: narrationTitle }],
              })
              adoptSession(saved.sessionId)
            } catch { /* best-effort persistence */ }
            return
          }
          if (s.status === "error") return
        } catch {
          // transient — keep polling
        }
        window.setTimeout(() => void poll(), 1500)
      }
      window.setTimeout(() => void poll(), 1200)
    },
    [adoptSession],
  )

  // Comparison is also a BACKGROUND job (per-cell grounded extraction takes a while):
  // push a progress card, poll it, and on completion open the table in the work-panel.
  const startCompareJob = useCallback(
    async (selected: PaperItem[], dimensions: string[]) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      const userMessage: LabMessage = {
        id: makeMessageId("user"),
        role: "user",
        content: `Compare: ${selected.map((p) => p.title).join("  ·  ")}`,
      }
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
      setError("")

      const updateAssistant = (patch: Partial<LabMessage>) => {
        setMessages((current) =>
          current.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
        )
      }

      let jobId = ""
      try {
        const res = await startCompare(selected.map((p) => p.docId), dimensions)
        jobId = res.jobId
        updateAssistant({
          isTyping: false,
          comparison: { jobId, status: "queued", papers: selected },
        })
      } catch (err) {
        updateAssistant({
          isTyping: false,
          comparison: { jobId: "", status: "error", error: String(err), papers: selected },
        })
        inFlightRef.current = false
        return
      }
      setAnswerIsComplete(true)
      inFlightRef.current = false

      const poll = async () => {
        try {
          const s = await getCompare(jobId)
          updateAssistant({
            comparison: {
              jobId,
              status: s.status,
              stage: s.stage,
              detail: s.detail,
              progress: s.progress,
              error: s.error,
              papers: selected,
            },
          })
          if (s.status === "done") {
            if (s.result) {
              const result = s.result
              // Store the table on the message so its "View" reopens THIS turn's data.
              updateAssistant({
                comparison: { jobId, status: "done", papers: selected, result },
              })
              setComparison(result)
              setComparisonActive(true)
              try {
                const saved = await saveChatTurn({
                  sessionId: activeSessionIdRef.current,
                  title: `Compare: ${selected.map((p) => p.title).join(" · ")}`,
                  userContent: `Compare: ${selected.map((p) => p.title).join("  ·  ")}`,
                  widgets: [{ kind: "comparison", result, papers: selected }],
                })
                adoptSession(saved.sessionId)
              } catch { /* best-effort persistence */ }
            }
            return
          }
          if (s.status === "error") return
        } catch {
          // transient — keep polling
        }
        window.setTimeout(() => void poll(), 1500)
      }
      window.setTimeout(() => void poll(), 1200)
    },
    [adoptSession],
  )

  // `/write`: the agentic literature-review job (extract→compare→synthesize→write). Push a
  // progress card, poll it, and on completion replace the card with the finished draft
  // (which renders through the normal cited-answer path + a Copy button).
  const startWriteupJob = useCallback(
    async (topic: string, docIds: string[], dimensions: string[]) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      const userMessage: LabMessage = {
        id: makeMessageId("user"),
        role: "user",
        content: topic,
      }
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
      setError("")

      const updateAssistant = (patch: Partial<LabMessage>) => {
        setMessages((current) =>
          current.map((m) => (m.id === assistantId ? { ...m, ...patch } : m))
        )
      }

      let jobId = ""
      try {
        const res = await startWriteup(topic, docIds, dimensions)
        jobId = res.jobId
        updateAssistant({ isTyping: false, writeup: { jobId, status: "queued" } })
      } catch (err) {
        updateAssistant({
          isTyping: false,
          writeup: { jobId: "", status: "error", error: String(err) },
        })
        inFlightRef.current = false
        return
      }
      setAnswerIsComplete(true)
      inFlightRef.current = false

      const poll = async () => {
        try {
          const s = await getWriteup(jobId)
          if (s.status === "done") {
            if (s.result) {
              const result = s.result
              const citations = result.citations as unknown as LabCitation[]
              updateAssistant({
                writeup: undefined,
                isTyping: false,
                streaming: false,
                content: result.answer,
                visibleContent: result.answer,
                citations,
                draft: true,
              })
              try {
                const saved = await saveChatTurn({
                  sessionId: activeSessionIdRef.current,
                  title: topic,
                  userContent: topic,
                  assistantContent: result.answer,
                  citations: result.citations as unknown as unknown[],
                  widgets: [{ kind: "draft" }],
                })
                adoptSession(saved.sessionId)
              } catch { /* best-effort persistence */ }
            } else {
              updateAssistant({ writeup: { jobId, status: "error", error: "no result produced" } })
            }
            return
          }
          if (s.status === "error") {
            updateAssistant({ writeup: { jobId, status: "error", stage: s.stage, error: s.error } })
            return
          }
          updateAssistant({
            writeup: { jobId, status: s.status, stage: s.stage, detail: s.detail, progress: s.progress },
          })
        } catch {
          // transient — keep polling
        }
        window.setTimeout(() => void poll(), 1500)
      }
      window.setTimeout(() => void poll(), 1200)
    },
    [adoptSession],
  )

  const submitQuestion = useCallback(async (nextQuery?: string) => {
    const finalQuery = (nextQuery ?? input).trim()

    if (finalQuery.length < 2) {
      setError("Please enter a question.")
      return
    }

    const { skill: parsedSkill, query: backendQuery } = parseSkill(finalQuery)

    // Narration is a background job — delegate before the standard chat-message setup.
    if (parsedSkill === "narrate") {
      void startNarrationJob({ query: backendQuery, userText: finalQuery })
      return
    }

    // Compare is driven by the inline multi-select picker + confirm card, not a plain
    // submit. Swallow a stray Enter/Send on `/compare …` so it never hits the chat API.
    if (parsedSkill === "compare") {
      return
    }

    // `/write` opens a confirm card (top-N papers + dimensions); the card's "Generate
    // draft" starts the background literature-review job. Never a plain submit.
    if (parsedSkill === "write") {
      void runProposePlan(backendQuery)
      return
    }

    // Hard guard against duplicate submissions while a request is in flight.
    if (inFlightRef.current) return
    inFlightRef.current = true

    // Logged-in chats build history server-side from the saved session; only
    // anonymous chats send the client transcript.
    const history = isAuthenticated ? [] : buildChatHistory(messagesRef.current)

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
    setAnswerIsComplete(false)
    setError("")
    setIsResetting(false)

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


      if (payload.type === "graph") {
        // Open the citation map in the right work-panel, and stash it on the message so
        // its "View citation map" button reopens this turn's graph (live + on reload).
        const data = { nodes: payload.nodes, edges: payload.edges }
        setGraph(data)
        setGraphActive(true)
        updateAssistant({ graphData: data })
        return
      }

      if (payload.type === "refs") {
        updateAssistant({ refResults: payload.matches })
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
          related: payload.related,
          retrievedCount: payload.retrievedCount,
          insufficientContext: payload.insufficientContext,
        })
        setAnswerIsComplete(true)
        adoptSession(payload.sessionId ?? null)
        return
      }

      if (payload.type === "error") {
        throw new Error(payload.message || "Something went wrong.")
      }
    }

    try {
      const response = await fetch(`${API_BASE}/api/agent/stream`, {
        method: "POST",
        headers: buildLabRequestHeaders(),
        body: JSON.stringify({
          query: backendQuery,
          history,
          session_id: activeSessionIdRef.current ?? undefined,
          limit: 10,
          skill: parsedSkill,
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
          setAnswerIsComplete(true)
        } else {
          throw new Error("No response received.")
        }
      }
    } catch (nextError) {
      // Keep the conversation; drop only the failed assistant placeholder.
      setMessages((prev) => prev.filter((message) => message.id !== assistantId))
      setError(nextError instanceof Error ? nextError.message : "Something went wrong.")
      setAnswerIsComplete(true)
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [input, isAuthenticated, adoptSession])

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

  // Slash menu: open while typing a command (leading "/", no space yet).
  const slashQuery =
    input.startsWith("/") && !input.includes(" ") ? input.slice(1).toLowerCase() : null
  const slashMatches =
    slashQuery !== null
      ? SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(slashQuery))
      : []
  const slashOpen = !slashDismissed && slashMatches.length > 0
  const slashSelected = Math.min(slashIndex, Math.max(0, slashMatches.length - 1))

  // Paper picker: active once you're typing the argument of `/narrate ` (command + space).
  const narrateArg = /^\/narrate\s+([\s\S]*)$/i.exec(input)
  const paperFilter = narrateArg ? narrateArg[1].trim().toLowerCase() : null
  const paperFilterTokens = paperFilter ? paperFilter.split(/\s+/).filter(Boolean) : []
  const paperMatches =
    paperFilter !== null
      ? papers.filter((p) => {
          const t = (p.title || "").toLowerCase()
          return paperFilterTokens.every((tok) => t.includes(tok))
        }).slice(0, 8)
      : []
  const paperPickerOpen = !paperDismissed && paperFilter !== null && papers.length > 0
  const paperSelected = Math.min(paperIndex, Math.max(0, paperMatches.length - 1))

  // Compare multi-select picker: active while typing the argument of `/compare `.
  const compareArg = /^\/compare\s+([\s\S]*)$/i.exec(input)
  const compareFilter = compareArg ? compareArg[1].trim().toLowerCase() : null
  const compareFilterTokens = compareFilter ? compareFilter.split(/\s+/).filter(Boolean) : []
  const compareSelectedIds = useMemo(
    () => new Set(compareSelection.map((p) => p.docId)),
    [compareSelection]
  )
  const compareMatches =
    compareFilter !== null
      ? papers
          .filter((p) => !compareSelectedIds.has(p.docId))
          .filter((p) => {
            const t = (p.title || "").toLowerCase()
            return compareFilterTokens.every((tok) => t.includes(tok))
          })
          .slice(0, 8)
      : []
  const comparePickerOpen = !compareDismissed && compareFilter !== null && papers.length > 0
  const compareHighlighted = Math.min(compareIndex, Math.max(0, compareMatches.length - 1))

  // Lazily load the library the first time either picker (narrate/compare) is needed.
  useEffect(() => {
    if ((paperFilter !== null || compareFilter !== null) && !papersLoadedRef.current) {
      papersLoadedRef.current = true
      listPapers()
        .then((r) => setPapers(r.papers))
        .catch(() => { papersLoadedRef.current = false })
    }
  }, [paperFilter, compareFilter])

  function selectPaper(p: PaperItem) {
    setPaperDismissed(true)
    void startNarrationJob({ docId: p.docId, userText: `Narrate: ${p.title}` })
  }

  // Add a paper to the comparison set, then reset the filter (keep the picker open) so
  // the user can keep picking. Capped at the backend's MAX_PAPERS.
  function addCompare(p: PaperItem) {
    setCompareSelection((prev) =>
      prev.some((x) => x.docId === p.docId) ? prev : [...prev, p].slice(0, 5)
    )
    setInput("/compare ")
    setCompareDismissed(false)
    setCompareIndex(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function removeCompare(docId: string) {
    setCompareSelection((prev) => prev.filter((p) => p.docId !== docId))
  }

  // Confirm step: propose the comparison dimensions for the chosen papers, then show the
  // editable confirm card. Clears the picker; the run starts only after confirmation.
  async function runPropose(selected: PaperItem[]) {
    if (selected.length < 2) return
    setCompareDismissed(true)
    setInput("")
    setCompareSelection([])
    setComparePrompt({ papers: selected, dimensions: [], status: "proposing" })
    try {
      const { dimensions } = await proposeCompare(selected.map((p) => p.docId))
      setComparePrompt({ papers: selected, dimensions, status: "confirming" })
    } catch (err) {
      setComparePrompt({ papers: selected, dimensions: [], status: "error", error: String(err) })
    }
  }

  function addDimension() {
    const value = dimDraft.trim()
    if (!value) return
    setComparePrompt((prev) =>
      prev && !prev.dimensions.some((d) => d.toLowerCase() === value.toLowerCase())
        ? { ...prev, dimensions: [...prev.dimensions, value].slice(0, 6) }
        : prev
    )
    setDimDraft("")
  }

  function removeDimension(dim: string) {
    setComparePrompt((prev) =>
      prev ? { ...prev, dimensions: prev.dimensions.filter((d) => d !== dim) } : prev
    )
  }

  function runCompare() {
    if (!comparePrompt) return
    const { papers: selected, dimensions } = comparePrompt
    const dims = dimensions.filter((d) => d.trim())
    if (selected.length < 2 || dims.length === 0) return
    setComparePrompt(null)
    setDimDraft("")
    void startCompareJob(selected, dims)
  }

  // `/write`: propose the plan (top-N papers + dimensions) → confirm card → "Generate draft"
  // starts the background extract→compare→synthesize→write job.
  async function runProposePlan(topic: string) {
    setWritePrompt({ topic, papers: [], dimensions: [], status: "planning" })
    setWriteScope([])
    setInput("")
    try {
      const { papers, dimensions } = await proposePlan(topic)
      setWritePrompt({ topic, papers, dimensions, status: "confirming" })
      setWriteScope(papers.map((p) => p.docId))
    } catch (err) {
      setWritePrompt({ topic, papers: [], dimensions: [], status: "error", error: String(err) })
    }
  }

  function toggleWritePaper(docId: string) {
    setWriteScope((prev) =>
      prev.includes(docId) ? prev.filter((d) => d !== docId) : [...prev, docId]
    )
  }

  function addWriteDimension() {
    const value = writeDimDraft.trim()
    if (!value) return
    setWritePrompt((prev) =>
      prev && !prev.dimensions.some((d) => d.toLowerCase() === value.toLowerCase())
        ? { ...prev, dimensions: [...prev.dimensions, value].slice(0, 5) }
        : prev
    )
    setWriteDimDraft("")
  }

  function removeWriteDimension(dim: string) {
    setWritePrompt((prev) =>
      prev ? { ...prev, dimensions: prev.dimensions.filter((d) => d !== dim) } : prev
    )
  }

  function runWriteup() {
    if (!writePrompt) return
    const dims = writePrompt.dimensions.filter((d) => d.trim())
    const docIds = writeScope
    if (docIds.length === 0 || dims.length === 0) return
    const topic = writePrompt.topic
    setWritePrompt(null)
    setWriteDimDraft("")
    setWriteScope([])
    void startWriteupJob(topic, docIds, dims)
  }

  function applyCommand(insert: string) {
    setInput(insert)
    setSlashDismissed(false)
    setSlashIndex(0)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (comparePickerOpen) {
      if (compareMatches.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          setCompareIndex((i) => (i + 1) % compareMatches.length)
          return
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          setCompareIndex((i) => (i - 1 + compareMatches.length) % compareMatches.length)
          return
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault()
          addCompare(compareMatches[compareHighlighted])
          return
        }
      }
      // No filter text + enough papers picked: Enter confirms and proposes dimensions.
      if (event.key === "Enter" && !compareFilter && compareSelection.length >= 2) {
        event.preventDefault()
        void runPropose(compareSelection)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setCompareDismissed(true)
        return
      }
    }

    if (paperPickerOpen && paperMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setPaperIndex((i) => (i + 1) % paperMatches.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setPaperIndex((i) => (i - 1 + paperMatches.length) % paperMatches.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        selectPaper(paperMatches[paperSelected])
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setPaperDismissed(true)
        return
      }
    }

    if (slashOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setSlashIndex((i) => (i + 1) % slashMatches.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        applyCommand(slashMatches[slashSelected].insert)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setSlashDismissed(true)
        return
      }
    }

    if (event.key !== "Enter" || event.shiftKey) return

    event.preventDefault()

    if (canSubmit) {
      void submitQuestion()
    }
  }

  function handleNewSearch() {
    if (isLoading) return

    shouldAutoScrollRef.current = true
    skipAutoSubmitRef.current = true
    submittedQueryRef.current = initialQuery
    loadedSessionRef.current = null
    setInput("")
    setMessages([])
    setError("")
    setAnswerIsComplete(false)
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

  const chatContextItems = useMemo<ContextItem[]>(() => {
    if (!isAuthenticated) return []

    return sessions.map((session) => {
      const title = session.title || "Untitled chat"
      const label = title.charAt(0).toUpperCase() + title.slice(1)

      return {
        label,
        href: `/ask?session=${session.id}`,
        actions: [
          {
            label: "Rename",
            onSelect: () => void handleRenameSession(session.id, title),
          },
          {
            label: "Delete",
            destructive: true,
            onSelect: () => void handleDeleteSession(session.id),
          },
        ],
      }
    })
  }, [handleDeleteSession, handleRenameSession, isAuthenticated, sessions])

  return (
    <div className={pageStyles.pageShell}>
      <AppSidebar
        brandHref="/ask"
        sectionTitle="Chats"
        contextItems={chatContextItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <div className={`${pageStyles.mainContent} ${sidebarOpen ? pageStyles.mainContentOpen : pageStyles.mainContentClosed}`}>
        <div className={`${pageStyles.page} ${pdfTabs.length > 0 || graph || comparison ? pageStyles.pageSplit : ""}`}>
          <main className={`${pageStyles.main} ${hasMessages ? pageStyles.mainChat : ""} ${pdfTabs.length > 0 || graph || comparison ? pageStyles.mainSplit : ""}`}>
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
                  className={`${styles.chatScroll} ${isResetting ? styles.chatScrollResetting : ""}`}
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
                        onViewGraph={handleViewGraph}
                      />
                    ))}
                    <div ref={transcriptEndRef} aria-hidden />
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

              {comparePrompt ? (
                <div className={compareStyles.confirm}>
                  <div className={compareStyles.confirmHead}>
                    <span className={compareStyles.confirmTitle}>
                      Compare {comparePrompt.papers.length} papers
                    </span>
                    <button
                      type="button"
                      className={compareStyles.confirmCancel}
                      onClick={() => {
                        setComparePrompt(null)
                        setDimDraft("")
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className={compareStyles.confirmPapers}>
                    {comparePrompt.papers.map((p) => (
                      <span key={p.docId} className={compareStyles.confirmPaper} title={p.title}>
                        {p.title}
                      </span>
                    ))}
                  </div>
                  {comparePrompt.status === "proposing" ? (
                    <div className={compareStyles.confirmStatus}>
                      Proposing comparison dimensions…
                    </div>
                  ) : comparePrompt.status === "error" ? (
                    <div className={styles.warning}>
                      Couldn’t propose dimensions. {comparePrompt.error || ""}
                    </div>
                  ) : (
                    <>
                      <div className={compareStyles.confirmLabel}>
                        Comparison dimensions — edit before running
                      </div>
                      <div className={compareStyles.dimChips}>
                        {comparePrompt.dimensions.map((d) => (
                          <span key={d} className={compareStyles.dimChip}>
                            <span>{d}</span>
                            <button
                              type="button"
                              className={compareStyles.chipX}
                              aria-label={`Remove ${d}`}
                              onClick={() => removeDimension(d)}
                            >
                              <X size={12} strokeWidth={2} aria-hidden />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className={compareStyles.dimAddRow}>
                        <input
                          className={compareStyles.dimInput}
                          value={dimDraft}
                          onChange={(e) => setDimDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              addDimension()
                            }
                          }}
                          placeholder="Add a dimension…"
                        />
                        <button
                          type="button"
                          className={compareStyles.dimAddBtn}
                          onClick={addDimension}
                          disabled={!dimDraft.trim()}
                        >
                          Add
                        </button>
                      </div>
                      <div className={compareStyles.confirmActions}>
                        <button
                          type="button"
                          className={compareStyles.runBtn}
                          disabled={comparePrompt.dimensions.length === 0}
                          onClick={runCompare}
                        >
                          Run comparison
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {writePrompt ? (
                <div className={compareStyles.confirm}>
                  <div className={compareStyles.confirmHead}>
                    <span className={compareStyles.confirmTitle}>
                      Write a literature review on: {writePrompt.topic}
                    </span>
                    <button
                      type="button"
                      className={compareStyles.confirmCancel}
                      onClick={() => {
                        setWritePrompt(null)
                        setWriteDimDraft("")
                        setWriteScope([])
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {writePrompt.status === "planning" ? (
                    <div className={compareStyles.confirmStatus}>
                      Finding the most relevant papers…
                    </div>
                  ) : writePrompt.status === "error" ? (
                    <div className={styles.warning}>
                      Couldn’t plan the review. {writePrompt.error || ""}
                    </div>
                  ) : (
                    <>
                      <div className={compareStyles.confirmLabel}>
                        Papers — the most relevant in your library (toggle to include)
                      </div>
                      <div className={compareStyles.scopeChips}>
                        {writePrompt.papers.map((p) => {
                          const on = writeScope.includes(p.docId)
                          return (
                            <button
                              key={p.docId}
                              type="button"
                              title={p.title}
                              className={`${compareStyles.scopeChip} ${on ? compareStyles.scopeChipOn : ""}`}
                              onClick={() => toggleWritePaper(p.docId)}
                            >
                              {p.title}
                            </button>
                          )
                        })}
                      </div>
                      <div className={compareStyles.confirmLabel}>
                        Dimensions to extract from each paper — edit before running
                      </div>
                      <div className={compareStyles.dimChips}>
                        {writePrompt.dimensions.map((d) => (
                          <span key={d} className={compareStyles.dimChip}>
                            <span>{d}</span>
                            <button
                              type="button"
                              className={compareStyles.chipX}
                              aria-label={`Remove ${d}`}
                              onClick={() => removeWriteDimension(d)}
                            >
                              <X size={12} strokeWidth={2} aria-hidden />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className={compareStyles.dimAddRow}>
                        <input
                          className={compareStyles.dimInput}
                          value={writeDimDraft}
                          onChange={(e) => setWriteDimDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              addWriteDimension()
                            }
                          }}
                          placeholder="Add a dimension…"
                        />
                        <button
                          type="button"
                          className={compareStyles.dimAddBtn}
                          onClick={addWriteDimension}
                          disabled={!writeDimDraft.trim()}
                        >
                          Add
                        </button>
                      </div>
                      <div className={compareStyles.confirmActions}>
                        <button
                          type="button"
                          className={compareStyles.runBtn}
                          disabled={writeScope.length === 0 || writePrompt.dimensions.length === 0}
                          onClick={runWriteup}
                        >
                          Generate draft
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className={styles.composer}>
                <div className={styles.composerInputShell}>
                  {slashOpen ? (
                    <div className={styles.slashMenu} role="listbox" aria-label="Commands">
                      <div className={styles.slashMenuHint}>Skills</div>
                      {slashMatches.map((c, i) => (
                        <button
                          key={c.cmd}
                          type="button"
                          role="option"
                          aria-selected={i === slashSelected}
                          className={`${styles.slashItem} ${i === slashSelected ? styles.slashItemActive : ""}`}
                          onMouseEnter={() => setSlashIndex(i)}
                          onMouseDown={(e) => {
                            e.preventDefault() // keep textarea focus
                            applyCommand(c.insert)
                          }}
                        >
                          <span className={styles.slashCmd}>{c.cmd}</span>
                          <span className={styles.slashDesc}>{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {comparePickerOpen ? (
                    <div className={styles.slashMenu} role="listbox" aria-label="Compare papers">
                      <div className={styles.slashMenuHint}>Compare papers — pick 2 to 5</div>
                      {compareSelection.length > 0 ? (
                        <div className={compareStyles.chips}>
                          {compareSelection.map((p) => (
                            <span key={p.docId} className={compareStyles.chip} title={p.title}>
                              <span className={compareStyles.chipText}>{p.title}</span>
                              <button
                                type="button"
                                className={compareStyles.chipX}
                                aria-label={`Remove ${p.title}`}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  removeCompare(p.docId)
                                }}
                              >
                                <X size={12} strokeWidth={2} aria-hidden />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {compareMatches.length === 0 ? (
                        <div className={styles.slashItem}>
                          <span className={styles.slashDesc}>
                            {compareSelection.length >= 2
                              ? "No more matches — press Enter or Compare to continue"
                              : "No matching paper"}
                          </span>
                        </div>
                      ) : (
                        compareMatches.map((p, i) => (
                          <button
                            key={p.docId}
                            type="button"
                            role="option"
                            aria-selected={i === compareHighlighted}
                            className={`${styles.slashItem} ${i === compareHighlighted ? styles.slashItemActive : ""}`}
                            onMouseEnter={() => setCompareIndex(i)}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              addCompare(p)
                            }}
                            title={p.title}
                          >
                            <span className={styles.slashDesc}>{p.title}</span>
                          </button>
                        ))
                      )}
                      <div className={compareStyles.footer}>
                        <span className={compareStyles.footerCount}>
                          {compareSelection.length} selected
                        </span>
                        <button
                          type="button"
                          className={compareStyles.runBtn}
                          disabled={compareSelection.length < 2}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            void runPropose(compareSelection)
                          }}
                        >
                          Compare →
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {paperPickerOpen ? (
                    <div className={styles.slashMenu} role="listbox" aria-label="Papers">
                      <div className={styles.slashMenuHint}>Narrate a paper</div>
                      {paperMatches.length === 0 ? (
                        <div className={styles.slashItem}>
                          <span className={styles.slashDesc}>No matching paper</span>
                        </div>
                      ) : (
                        paperMatches.map((p, i) => (
                          <button
                            key={p.docId}
                            type="button"
                            role="option"
                            aria-selected={i === paperSelected}
                            className={`${styles.slashItem} ${i === paperSelected ? styles.slashItemActive : ""}`}
                            onMouseEnter={() => setPaperIndex(i)}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              selectPaper(p)
                            }}
                            title={p.title}
                          >
                            <span className={styles.slashDesc}>{p.title}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(event) => {
                      setInput(event.target.value)
                      setSlashDismissed(false)
                      setSlashIndex(0)
                      setPaperDismissed(false)
                      setPaperIndex(0)
                      setCompareDismissed(false)
                      setCompareIndex(0)
                    }}
                    onKeyDown={handleKeyDown}
                    className={styles.composerTextarea}
                    placeholder={
                      hasMessages
                        ? "Ask a follow-up, or type / for skills…"
                        : "Ask anything about your research papers — or type / for skills…"
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

          {pdfTabs.length > 0 || graph || comparison ? (
            <PdfViewerPanel
              tabs={pdfTabs}
              activeTabId={activePdfTabId}
              onSelectTab={(id) => {
                setActivePdfTabId(id)
                setGraphActive(false)
                setComparisonActive(false)
              }}
              onCloseTab={handleClosePdfTab}
              onClosePanel={handleClosePdfPanel}
              graph={graph}
              graphActive={graphActive}
              onSelectGraph={() => {
                setGraphActive(true)
                setComparisonActive(false)
              }}
              onCloseGraph={handleCloseGraph}
              onOpenNode={(node) =>
                handleOpenSource({
                  sourceId: node.id,
                  title: node.title,
                  url: "",
                  sourceType: "pdf",
                  category: "",
                  sectionTitle: "",
                  contentMode: "full_text",
                  page: 1,
                })
              }
              comparison={comparison}
              comparisonActive={comparisonActive}
              onSelectComparison={handleViewComparison}
              onCloseComparison={handleCloseComparison}
              onOpenComparisonSource={handleOpenComparisonSource}
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
