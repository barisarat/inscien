// US-Eastern time helpers for the trading pages. Backend timestamps are UTC
// but often serialized without a zone marker, so parsing must force UTC.

export const ET_ZONE = "America/New_York"

export function parseUtc(ts: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(ts)
  return new Date(hasZone ? ts : `${ts}Z`)
}

function etParts(date: Date, withTime: boolean): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false } : {}),
  })
  const out: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) out[part.type] = part.value
  return out
}

/** "06-10 09:45 ET" — full timestamp for cards/tooltips. */
export function formatEt(ts: string | null | undefined): string {
  if (!ts) return "—"
  const p = etParts(parseUtc(ts), true)
  return `${p.month}-${p.day} ${p.hour}:${p.minute} ET`
}

/** Compact chart tick: "06-10 09:45" intraday, "06-10" daily. */
export function formatEtTick(ts: string, intraday: boolean): string {
  const p = etParts(parseUtc(ts), intraday)
  return intraday ? `${p.month}-${p.day} ${p.hour}:${p.minute}` : `${p.month}-${p.day}`
}

/** "09:45:12 ET" — live clock. */
export function formatEtClock(date: Date): string {
  const p = etParts(date, true)
  return `${p.hour}:${p.minute}:${p.second} ET`
}

export const US_SESSION_LABEL = "9:30 AM – 4:00 PM ET"

/** Regular-session status from wall-clock ET (weekday 9:30–16:00; US market
 * holidays are not modeled — the paper engine's no-new-bar guard covers them). */
export function usMarketStatus(date: Date): { open: boolean; label: string } {
  const p = etParts(date, true)
  const isWeekday = !["Sat", "Sun"].includes(p.weekday)
  const minutes = Number(p.hour) * 60 + Number(p.minute)
  const open = isWeekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60
  return { open, label: open ? "Market open" : "Market closed" }
}

/** "12s ago" / "5m ago" / "3h ago" / "2d ago"; "—" for missing timestamps. */
export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "—"
  const seconds = Math.max(0, Math.floor((Date.now() - parseUtc(ts).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
