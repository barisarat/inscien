"use client"

import { useState, useMemo } from "react"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import { utilities } from "../data/registry"
import type { UtilityDef, CodeUtilityDef, NoteUtilityDef, CodeNoteUtilityDef } from "../data/types"
import styles from "./utility-detail.module.css"

const PYTHON_TOKENS: Array<{ pattern: RegExp; className: string }> = [
  {
    pattern: /\b(from|import|def|with|as|if|return|True|False|None|and|or|not|in|is|for|while|class|pass|raise|try|except|finally|yield|lambda|global|nonlocal|del|assert|break|continue|elif|else)\b/g,
    className: "kw",
  },
  {
    pattern: /("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g,
    className: "str",
  },
  { pattern: /#.*/g, className: "comment" },
  { pattern: /\b(__name__|__main__)\b/g, className: "special" },
  { pattern: /\b\d+(\.\d+)?\b/g, className: "num" },
  { pattern: /\b([a-z_][a-zA-Z0-9_]*)\s*(?=\()/g, className: "fn" },
]

const BASH_TOKENS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /#.*/g, className: "comment" },
  { pattern: /\b(git|cd|cp|touch|nano|grep|source|chmod)\b/g, className: "fn" },
  { pattern: /\b(clone|add|commit|push|pull|fetch|branch|remote|show-ref|set-url|restore|clean|switch|status)\b/g, className: "fn" },
  { pattern: /(--mirror|--bare|--show-current|--track|-u|-v|-a|-m|-f|-d|-fd|-fdn|-c)\b/g, className: "kw" },
  { pattern: /(https?:\/\/[^\s]+)/g, className: "str" },
  { pattern: /\b(origin|HEAD)\b/g, className: "special" },
  { pattern: /('[^']*')/g, className: "str" },
]

function tokenize(code: string, language: string): { text: string; className: string }[] {
  const tokenSet = language === "bash" ? BASH_TOKENS : PYTHON_TOKENS
  type Span = { start: number; end: number; className: string }
  const spans: Span[] = []

  for (const { pattern, className } of tokenSet) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")
    let m: RegExpExecArray | null

    while ((m = re.exec(code)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, className })
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

  const tokens: { text: string; className: string }[] = []
  let pos = 0

  for (const span of accepted) {
    if (span.start > pos) {
      tokens.push({ text: code.slice(pos, span.start), className: "plain" })
    }

    tokens.push({ text: code.slice(span.start, span.end), className: span.className })
    pos = span.end
  }

  if (pos < code.length) {
    tokens.push({ text: code.slice(pos), className: "plain" })
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

// Assemble the full doc as Markdown text for the clipboard.
function serializeDoc(item: UtilityDef): string {
  const out: string[] = [`# ${item.name}`]

  if (item.desc) out.push("", item.desc)

  if (item.kind === "code") {
    if (item.install?.length) {
      out.push("", "## Installation")
      for (const step of item.install) {
        out.push("", step.label, "```", step.command, "```")
      }
    }
    out.push("", "```" + item.language, item.code, "```")
    return out.join("\n")
  }

  if (item.intro) out.push("", item.intro)

  if (item.kind === "note") {
    for (const section of item.sections) {
      out.push("", `## ${section.title}`)
      if (section.text) for (const p of section.text) out.push("", p)
      if (section.bullets) {
        out.push("")
        for (const b of section.bullets) out.push(`- ${b}`)
      }
    }
  } else {
    for (const section of item.sections) {
      out.push("", `## ${section.title}`)
      for (const block of section.blocks) {
        if (block.kind === "text") {
          if (block.text) for (const p of block.text) out.push("", p)
          if (block.bullets) {
            out.push("")
            for (const b of block.bullets) out.push(`- ${b}`)
          }
        } else if (block.kind === "code") {
          out.push("", "```" + (block.language ?? ""), block.code ?? "", "```")
        } else if (block.kind === "table") {
          out.push("")
          if (block.headers?.length) {
            out.push(`| ${block.headers.join(" | ")} |`)
            out.push(`| ${block.headers.map(() => "---").join(" | ")} |`)
          }
          if (block.rows) for (const row of block.rows) out.push(`| ${row.join(" | ")} |`)
        }
      }
    }
  }

  if (item.resources?.length) {
    out.push("", "## Resources")
    for (const r of item.resources) out.push(`- ${r.label}: ${r.href}`)
  }

  return out.join("\n")
}

function CopyDocButton({ item }: { item: UtilityDef }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard
      .writeText(serializeDoc(item))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {})
  }

  return (
    <button
      type="button"
      className={styles.copyDocBtn}
      onClick={handleCopy}
      aria-label="Copy entire doc to clipboard"
    >
      {copied ? <IconCheck /> : <IconCopy />}
      <span className={styles.copyDocBtnLabel}>{copied ? "Copied" : "Copy doc"}</span>
    </button>
  )
}

function ShellBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className={styles.shellBlock}>
      <span className={styles.shellPrompt}>$</span>
      <code className={styles.shellCode}>{command}</code>
      <button
        className={`${styles.iconBtn} ${copied ? styles.iconBtnActive : ""}`}
        onClick={handleCopy}
        aria-label="Copy command"
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
    </div>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  const tokens = useMemo(() => tokenize(code, language), [code, language])

  return (
    <div className={styles.codeBlock}>
      <button
        className={`${styles.codeCopyBtn} ${copied ? styles.iconBtnActive : ""}`}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
      <pre className={styles.pre}>
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={styles[t.className] ?? ""}>{t.text}</span>
          ))}
        </code>
      </pre>
    </div>
  )
}

function CodeBody({ item }: { item: CodeUtilityDef }) {
  return (
    <div className={styles.body}>
      {item.install && item.install.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Installation</h2>
          <div className={styles.stepList}>
            {item.install.map((s, i) => (
              <div key={i} className={styles.stepItem}>
                <span className={styles.stepLabel}>{s.label}</span>
                <ShellBlock command={s.command} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Code</h2>
        <CodeBlock code={item.code} language={item.language} />
      </div>
    </div>
  )
}

function NoteBody({ item }: { item: NoteUtilityDef }) {
  return (
    <div className={styles.body}>
      <p className={styles.intro}>{item.intro}</p>

      {item.sections.map((section) => (
        <div key={section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>

          {section.text && section.text.length > 0 && (
            <div className={styles.paragraphGroup}>
              {section.text.map((p, i) => (
                <p key={i} className={styles.paragraph}>{p}</p>
              ))}
            </div>
          )}

          {section.bullets && section.bullets.length > 0 && (
            <ul className={styles.bulletList}>
              {section.bullets.map((b, i) => (
                <li key={i} className={styles.bulletItem}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {item.resources && item.resources.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Resources</h2>
          <div className={styles.resourceList}>
            {item.resources.map((r) => (
              <a key={r.href} href={r.href} target="_blank" rel="noreferrer" className={styles.resourceLink}>
                <span className={styles.resourceLabel}>{r.label}</span>
                <span className={styles.resourceHref}>{r.href}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CodeNoteBody({ item }: { item: CodeNoteUtilityDef }) {
  return (
    <div className={styles.body}>
      <p className={styles.intro}>{item.intro}</p>

      {item.resources && item.resources.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Resources</h2>
          <div className={styles.resourceList}>
            {item.resources.map((r) => (
              <a key={r.href} href={r.href} target="_blank" rel="noreferrer" className={styles.resourceLink}>
                <span className={styles.resourceLabel}>{r.label}</span>
                <span className={styles.resourceHref}>{r.href}</span>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.externalIcon}>
                  <path d="M6.5 3.5H3.5A1 1 0 0 0 2.5 4.5v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9.5 2.5h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.5 2.5L7.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}

      {item.sections.map((section) => (
        <div key={section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          <div className={styles.sectionBlocks}>
            {section.blocks.map((block, i) => {
              if (block.kind === "text") {
                return (
                  <div key={i}>
                    {(block.text || []).map((p, j) => (
                      <p key={j} className={styles.paragraph}>{p}</p>
                    ))}

                    {(block.bullets || []).length > 0 && (
                      <ul className={styles.bulletList}>
                        {(block.bullets || []).map((b, j) => (
                          <li key={j} className={styles.bulletItem}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              }

              if (block.kind === "table" && block.headers && block.rows) {
                return (
                  <table key={i} className={styles.shortcutTable}>
                    <thead>
                      <tr>
                        {block.headers.map((h, j) => (
                          <th key={j}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci}>
                              {ci === 0 ? (
                                <span className={styles.kbdGroup}>
                                  {cell.match(/[^+]+|\+(?=$)/g)?.map((key, ki, arr) => (
                                    <span key={ki}>
                                      <kbd className={styles.kbd}>{key.trim()}</kbd>
                                      {ki < arr.length - 1 && <span className={styles.kbdPlus}>+</span>}
                                    </span>
                                  ))}
                                </span>
                              ) : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }

              if (block.kind === "code" && block.code) {
                return <CodeBlock key={i} code={block.code} language={block.language || "bash"} />
              }

              return null
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function UtilityDetail({ item }: { item: UtilityDef }) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()

  const sidebarItems = useMemo(
    () => utilities.map((u) => ({ label: u.name, href: `/docs/${u.id}` })),
    []
  )

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/docs"
        sectionTitle="Docs"
        contextItems={sidebarItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader
        sidebarOpen={sidebarOpen}
        rightActions={
          <div className={styles.headerActions}>
            <CopyDocButton item={item} />
          </div>
        }
      />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{item.name}</h1>
            <p className={styles.desc}>{item.desc}</p>
          </header>

          <main className={styles.main}>
            <section className={styles.contentBlock}>
              {item.kind === "code" && <CodeBody item={item as CodeUtilityDef} />}
              {item.kind === "note" && <NoteBody item={item as NoteUtilityDef} />}
              {item.kind === "codenote" && <CodeNoteBody item={item as CodeNoteUtilityDef} />}
            </section>
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}