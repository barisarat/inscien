"use client"

import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, ExternalLink } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { API_BASE } from "@/lib/api"
import styles from "../../components/AskClient.module.css"

// Shared answer/draft renderer — the same markdown + page-cited styling the chat uses,
// so Ask answers and Write drafts look identical. Faithful copy of AskClient's renderer
// (minus the syntax-highlight CodeBlock, which lit-review prose doesn't need).

export type Citation = {
  title: string
  url?: string
  sourceId?: string
  page?: number | null
  passage?: string
  // Passage bounding box [x0, y0, x1, y1] in PDF points (top-left origin) for
  // coordinate-based highlighting; absent → viewer falls back to text-matching.
  bbox?: number[] | null
}

const CITATION_CLASS = "lab-citation"

function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

function pdfHref(citation: Citation): string {
  if (!citation.sourceId) return ""
  const page = citation.page ?? 1
  return `${API_BASE}/api/papers/${encodeURIComponent(citation.sourceId)}#page=${page}`
}

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
    return (
      <a href={href} className={className} aria-label={ariaLabel} title={title} target="_blank" rel="noopener noreferrer" onClick={onClick}>
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

function createCitationPlugin(citations: Citation[]) {
  function splitTextNode(value: string): unknown[] {
    const parts: unknown[] = []
    const regex = /\[(\d+)\]/g
    let last = 0
    let match = regex.exec(value)
    while (match) {
      if (match.index > last) parts.push({ type: "text", value: value.slice(last, match.index) })
      const n = Number(match[1])
      const citation = citations[n - 1]
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
          children: [{ type: "text", value: `${n}` }],
        })
      } else {
        parts.push({ type: "text", value: match[0] })
      }
      last = regex.lastIndex
      match = regex.exec(value)
    }
    if (last < value.length) parts.push({ type: "text", value: value.slice(last) })
    return parts
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => (tree: any) => visit(tree)
}

function buildMarkdownComponents(citations: Citation[], onOpenSource?: (c: Citation) => void): Components {
  return {
    code({ className, children }) {
      const text = String(children ?? "")
      const language = /language-(\w+)/.exec(className || "")?.[1]
      if (language || text.includes("\n")) {
        return (
          <pre>
            <code>{text.replace(/\n$/, "")}</code>
          </pre>
        )
      }
      return <code className={styles.inlineCode}>{children}</code>
    },
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
        const idx = Number(String(children))
        const citation = Number.isFinite(idx) ? citations[idx - 1] : undefined
        return (
          <CitationLink
            href={href}
            title={title}
            ariaLabel={`Source ${String(children)}${title ? `, ${title}` : ""}`}
            className={`${styles.numberChip} ${styles.citationChip}`}
            onClick={citation && onOpenSource ? (e) => { e.preventDefault(); onOpenSource(citation) } : undefined}
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

export function AnswerRenderer({
  text,
  citations,
  onOpenSource,
}: {
  text: string
  citations: Citation[]
  onOpenSource?: (citation: Citation) => void
}) {
  const remarkPlugins = useMemo(() => [remarkGfm, createCitationPlugin(citations)], [citations])
  const components = useMemo(() => buildMarkdownComponents(citations, onOpenSource), [citations, onOpenSource])
  return (
    <div className={styles.answerText}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function CompactSources({
  citations,
  onOpenSource,
}: {
  citations: Citation[]
  onOpenSource?: (citation: Citation) => void
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
                    onClick={onOpenSource ? (e) => { e.preventDefault(); onOpenSource(citation) } : undefined}
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
