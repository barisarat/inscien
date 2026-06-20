export const RANGE_LABELS: Record<string, string> = {
  "1d": "1 day",
  "5d": "5 days",
  "1m": "1 month",
  "3m": "3 months",
  "6m": "6 months",
  "1y": "1 year",
  "2y": "2 years",
  "5y": "5 years",
}

export const FREQ_LABELS: Record<string, string> = {
  "60min": "hourly",
  "15min": "15-minute",
  "5min": "5-minute",
}

const RELATIVE_RANGE = /^(\d+)([dwmy])$/
const UNIT_NAMES: Record<string, string> = { d: "day", w: "week", m: "month", y: "year" }

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  })
}

// Badge text for a window: preset label, "10 days"-style relative token,
// "YTD", or "Mar 1, 2024 – May 31, 2024" for absolute windows.
export function rangeBadgeLabel(range?: string, start?: string, end?: string) {
  if (!range) return ""
  if (RANGE_LABELS[range]) return RANGE_LABELS[range]
  if (range === "ytd") return "YTD"

  const match = range.match(RELATIVE_RANGE)
  if (match) {
    const n = Number(match[1])
    return `${n} ${UNIT_NAMES[match[2]]}${n === 1 ? "" : "s"}`
  }

  if (range.includes("→")) {
    const [s, e] = start && end ? [start, end] : range.split("→").map((p) => p.trim())
    return s && e ? `${shortDate(s.slice(0, 10))} – ${shortDate(e.slice(0, 10))}` : range
  }

  return range
}

export function formatTick(value: string, intraday: boolean) {
  // Daily points are YYYY-MM-DD (show YYYY-MM); intraday points are ISO timestamps.
  const text = value ?? ""
  return intraday ? text.slice(5, 16).replace("T", " ") : text.slice(0, 7)
}

export function formatLabel(value: string, intraday: boolean) {
  const text = value ?? ""
  return intraday ? text.slice(0, 16).replace("T", " ") : text.slice(0, 10)
}
