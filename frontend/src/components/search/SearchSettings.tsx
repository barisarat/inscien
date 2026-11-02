"use client"

import { useEffect, useState } from "react"
import { Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchSearchStatus, fetchZoteroCollections, type SearchStatus, type ZoteroCollection } from "@/lib/api"
import { startIndex, useJob } from "@/lib/job"
import { DEFAULT_SETTINGS, type Matching, type Rerank, type SearchSettings as Settings } from "@/lib/search"

const ALL = "all"

function flatten(nodes: ZoteroCollection[], depth = 0): { value: string; label: string }[] {
  return nodes.flatMap((n) => [
    { value: String(n.collectionID), label: `${"\u00a0\u00a0".repeat(depth)}${n.name}` },
    ...flatten(n.children ?? [], depth + 1),
  ])
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {value ? <span className="text-xs tabular-nums text-muted-foreground">{value}</span> : null}
      </div>
      {children}
    </div>
  )
}

const one = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number))

// The gear beside the search bar: how Search retrieves and ranks, the filters, and what Ask
// gives the model. Defaults make the bar work without ever opening it.
export default function SearchSettings({ value, onChange }: { value: Settings; onChange: (next: Settings) => void }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const [collections, setCollections] = useState<{ value: string; label: string }[]>([])
  const job = useJob()
  const indexing = job?.kind === "index" && job.status === "running"

  useEffect(() => {
    if (!open) return
    fetchSearchStatus().then(setStatus).catch(() => setStatus(null))
    fetchZoteroCollections()
      .then((r) => setCollections(flatten(r.collections)))
      .catch(() => setCollections([]))
  }, [open, indexing])

  const set = (patch: Partial<Settings>) => onChange({ ...value, ...patch })
  const llm = (status?.models?.length ?? 0) > 0
  const models = status?.models ?? []
  const model = value.model && models.includes(value.model) ? value.model : status?.defaultModel ?? null
  const minYear = status?.minYear ?? null
  const maxYear = status?.maxYear ?? null
  const years: [number, number] | null =
    minYear != null && maxYear != null && maxYear > minYear
      ? [value.yearFrom ?? minYear, value.yearTo ?? maxYear]
      : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger render={<PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Search settings" />} />}>
          <Settings2 />
        </TooltipTrigger>
        <TooltipContent>Search settings</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80">
        <div className="grid gap-4">
          <Row label="Matching">
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[value.matching]}
              onValueChange={(v) => v[0] && set({ matching: v[0] as Matching })}
            >
              <ToggleGroupItem value="lexical">Keyword</ToggleGroupItem>
              <ToggleGroupItem value="semantic">Semantic</ToggleGroupItem>
              <ToggleGroupItem value="hybrid">Hybrid</ToggleGroupItem>
            </ToggleGroup>
          </Row>

          <Row label="Rerank">
            <Select
              value={value.rerank}
              onValueChange={(v) => set({ rerank: (v as Rerank) ?? "off" })}
              items={[
                { value: "off", label: "Off" },
                { value: "neural", label: "Neural" },
                ...(llm ? [{ value: "llm", label: "LLM" }] : []),
              ]}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="neural">Neural</SelectItem>
                {llm ? <SelectItem value="llm">LLM</SelectItem> : null}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Results" value={String(value.limit)}>
            <Slider value={value.limit} min={5} max={50} step={5} onValueChange={(v) => set({ limit: one(v) })} />
          </Row>

          <Row label="Per paper" value={String(value.perPaper)}>
            <Slider value={value.perPaper} min={1} max={5} step={1} onValueChange={(v) => set({ perPaper: one(v) })} />
          </Row>

          <Separator />

          {years ? (
            <Row label="Years" value={`${years[0]} - ${years[1]}`}>
              <Slider
                value={years}
                min={minYear!}
                max={maxYear!}
                step={1}
                onValueChange={(v) => {
                  const [from, to] = Array.isArray(v) ? v : [v, v]
                  set({ yearFrom: from === minYear ? null : from, yearTo: to === maxYear ? null : to })
                }}
              />
            </Row>
          ) : null}

          <Row label="Collection">
            <Select
              value={value.collection == null ? ALL : String(value.collection)}
              onValueChange={(v) => set({ collection: !v || v === ALL ? null : Number(v) })}
              items={[{ value: ALL, label: "All collections" }, ...collections]}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All collections</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Separator />

          {llm ? (
            <>
              <Row label="Ask model">
                <Select
                  value={model ?? ""}
                  onValueChange={(v) => set({ model: (v as string) || null })}
                  items={models.map((m) => ({ value: m, label: m }))}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Ask passages" value={String(value.passages)}>
                <Slider value={value.passages} min={5} max={20} step={1} onValueChange={(v) => set({ passages: one(v) })} />
              </Row>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Ask and LLM rerank need Ollama running.</p>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {status?.installed === false
                ? "Search is not installed"
                : status?.indexed
                  ? `${status.papers} papers indexed`
                  : "Not indexed yet"}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_SETTINGS)}>
                Reset
              </Button>
              <Button variant="outline" size="sm" disabled={indexing || status?.installed === false} onClick={() => startIndex()}>
                {indexing ? "Indexing" : "Update index"}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
