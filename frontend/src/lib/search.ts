"use client"

import { usePersisted } from "@/lib/usePersisted"

// Search and Ask: the two modes, the settings behind the gear, and how a run is written into the
// /map/search URL. The settings are a choice of THIS device (persisted in localStorage); the URL
// carries the query, the mode and the settings of one run, so a results page reloads as it was.

export type SearchKind = "search" | "ask"
export type Matching = "hybrid" | "lexical" | "semantic"
export type Rerank = "off" | "neural" | "llm"

export interface SearchSettings {
  matching: Matching
  rerank: Rerank
  limit: number
  perPaper: number
  yearFrom: number | null
  yearTo: number | null
  collection: number | null
  model: string | null
  passages: number
}

export const DEFAULT_SETTINGS: SearchSettings = {
  matching: "hybrid",
  rerank: "off",
  limit: 20,
  perPaper: 3,
  yearFrom: null,
  yearTo: null,
  collection: null,
  model: null,
  passages: 10,
}

export function useSearchSettings(): [SearchSettings, (next: SearchSettings) => void] {
  const [stored, setStored] = usePersisted<SearchSettings>("inscien.search", DEFAULT_SETTINGS)
  return [{ ...DEFAULT_SETTINGS, ...stored }, setStored]
}

// The results page URL for one run.
export function searchHref(q: string, kind: SearchKind, s: SearchSettings): string {
  const p = new URLSearchParams({ q, kind, mode: s.matching, rerank: s.rerank })
  if (kind === "search") {
    p.set("limit", String(s.limit))
  } else {
    p.set("passages", String(s.passages))
  }
  p.set("perPaper", String(s.perPaper))
  if (s.yearFrom != null) p.set("yearFrom", String(s.yearFrom))
  if (s.yearTo != null) p.set("yearTo", String(s.yearTo))
  if (s.collection != null) p.set("collection", String(s.collection))
  if (s.model && (kind === "ask" || s.rerank === "llm")) p.set("model", s.model)
  return `/map/search/?${p}`
}

// The API parameters for the run a results page URL describes.
export function apiParams(url: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams()
  for (const key of ["q", "mode", "rerank", "limit", "passages", "perPaper", "yearFrom", "yearTo", "collection", "model"]) {
    const value = url.get(key)
    if (value) out.set(key, value)
  }
  return out
}
