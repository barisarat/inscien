// Regex-based syntax highlighting for the developer docs. Pure function —
// safe to run in server components. Token classNames map to color classes in
// devdocs.module.css (kw/str/comment/special/num/fn/plain).

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
  { pattern: /\b(curl|python3|git|cd|cp|touch|nano|grep|source|chmod|jq)\b/g, className: "fn" },
  { pattern: /(--data|--header|-H|-X|-d)(?=\s)/g, className: "kw" },
  { pattern: /(https?:\/\/[^\s"']+)/g, className: "special" },
  { pattern: /("[^"]*"|'[^']*')/g, className: "str" },
]

const JSON_TOKENS: Array<{ pattern: RegExp; className: string }> = [
  { pattern: /("[^"\\]*(?:\\.[^"\\]*)*")(?=\s*:)/g, className: "fn" },
  { pattern: /("[^"\\]*(?:\\.[^"\\]*)*")/g, className: "str" },
  { pattern: /\b(true|false|null)\b/g, className: "kw" },
  { pattern: /-?\b\d+(\.\d+)?\b/g, className: "num" },
]

function tokenSetFor(language: string) {
  if (language === "bash") return BASH_TOKENS
  if (language === "json") return JSON_TOKENS
  return PYTHON_TOKENS
}

export function tokenize(code: string, language: string): { text: string; className: string }[] {
  const tokenSet = tokenSetFor(language)
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
