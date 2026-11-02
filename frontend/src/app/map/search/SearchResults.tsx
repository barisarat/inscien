"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, CircleAlert, DatabaseZap, SearchX } from "lucide-react"

import ModeBar from "@/components/navigation/ModeBar"
import SearchBar from "@/components/search/SearchBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { runAsk, runSearch, type AskAnswer, type SearchResult } from "@/lib/api"
import { startIndex, useJob } from "@/lib/job"
import { apiParams, type SearchKind } from "@/lib/search"
import SidebarAwayTrigger from "../workspace/SidebarAwayTrigger"
import { useWorkspace } from "../workspace/WorkspaceProvider"

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "search"; results: SearchResult[] }
  | { phase: "ask"; answer: AskAnswer }

const NOT_INDEXED = "The library is not indexed yet."

function byline(authors: string | null, year: number | null, venue?: string | null) {
  const first = authors?.split("; ")[0]?.split(",")[0]
  const lead = first ? `${first}${authors && authors.includes("; ") ? " et al." : ""}` : null
  return [lead, year, venue].filter(Boolean).join(", ")
}

function union(rects: number[][]): number[] | null {
  if (!rects.length) return null
  return [
    Math.min(...rects.map((r) => r[0])),
    Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])),
    Math.max(...rects.map((r) => r[3])),
  ]
}

export default function SearchResults() {
  const params = useSearchParams()
  const { openPdf } = useWorkspace()
  const job = useJob()
  const q = params.get("q") ?? ""
  const kind: SearchKind = params.get("kind") === "ask" ? "ask" : "search"
  const key = params.toString()
  const [state, setState] = useState<State>({ phase: "loading" })

  useEffect(() => {
    if (!q.trim()) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ phase: "loading" })
    const api = apiParams(new URLSearchParams(key))
    const request =
      kind === "ask"
        ? runAsk(api).then((answer): State => ({ phase: "ask", answer }))
        : runSearch(api).then((r): State => ({ phase: "search", results: r.results }))
    request
      .then((next) => live && setState(next))
      .catch((e) => live && setState({ phase: "error", message: e instanceof Error ? e.message : "Search failed" }))
    return () => {
      live = false
    }
  }, [key, kind, q])

  const indexing = job?.kind === "index" && job.status === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModeBar>
        <SidebarAwayTrigger />
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/map/" />}>
          <ArrowLeft />
          Map
        </Button>
        <SearchBar initialQuery={q} busy={state.phase === "loading" && q.trim() ? kind : null} />
      </ModeBar>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
          {!q.trim() ? (
            <Notice icon={<SearchX />} title="Nothing to search" description="Type a query in the bar above, then press Search or Ask." />
          ) : state.phase === "loading" ? (
            <>
              <Waiting key={key} kind={kind} params={params} />
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </>
          ) : state.phase === "error" && state.message === NOT_INDEXED ? (
            <Notice icon={<DatabaseZap />} title="Not indexed yet" description="Search and Ask read the index of your papers. Build it once; it updates in the job pane.">
              <Button variant="outline" size="sm" disabled={indexing} onClick={() => startIndex()}>
                {indexing ? <Spinner /> : null}
                {indexing ? "Indexing" : "Index the library"}
              </Button>
            </Notice>
          ) : state.phase === "error" ? (
            <Notice icon={<CircleAlert />} title={kind === "ask" ? "Ask failed" : "Search failed"} description={state.message} />
          ) : state.phase === "search" ? (
            <SearchList results={state.results} onOpen={openPdf} />
          ) : (
            <AskView question={q} answer={state.answer} onOpen={openPdf} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// The status line while a run is in flight: what it is doing and how long it has taken, so a slow
// Ask (the language model reads every passage) never looks like a stalled page.
function Waiting({ kind, params }: { kind: SearchKind; params: URLSearchParams }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const rerank = params.get("rerank")
  const model = params.get("model") ?? "the language model"
  const label =
    kind === "ask"
      ? `Finding passages and asking ${model}`
      : rerank === "llm"
        ? `Searching passages and reranking with ${model}`
        : rerank === "neural"
          ? "Searching and reranking passages"
          : "Searching passages"
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      <span>{label}</span>
      <span className="ml-auto tabular-nums">{seconds} s</span>
    </div>
  )
}

function Notice({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children?: React.ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  )
}

type Open = ReturnType<typeof useWorkspace>["openPdf"]

function SearchList({ results, onOpen }: { results: SearchResult[]; onOpen: Open }) {
  if (!results.length) {
    return <Notice icon={<SearchX />} title="No passages found" description="Try other words, or switch matching in the search settings." />
  }
  const kept = results.filter((r) => !r.dropped)
  const dropped = results.filter((r) => r.dropped)
  const card = (r: SearchResult) => (
    <Card
      key={r.chunkId}
      size="sm"
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${r.dropped ? "opacity-60" : ""}`}
      onClick={() => onOpen({ sourceId: r.itemKey, title: r.title, page: r.page, passage: r.text, bbox: r.bbox })}
    >
      <CardHeader>
        <CardTitle>{r.title}</CardTitle>
        <CardDescription>{byline(r.authors, r.year, r.venue)}</CardDescription>
        <CardAction>
          <Badge variant="secondary">p. {r.page}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{r.text}</p>
      </CardContent>
    </Card>
  )
  return (
    <>
      <p className="text-xs text-muted-foreground">{kept.length} passages</p>
      {kept.map(card)}
      {dropped.length ? (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground">Left out by the reranker</p>
          {dropped.map(card)}
        </>
      ) : null}
    </>
  )
}

function AskView({ question, answer, onOpen }: { question: string; answer: AskAnswer; onOpen: Open }) {
  return (
    <>
      <h2 className="text-base font-medium">{question}</h2>
      {answer.summary ? <p className="text-sm leading-relaxed">{answer.summary}</p> : null}
      {answer.quotes.length ? (
        answer.quotes.map((quote) => (
          <Card
            key={`${quote.chunkId}-${quote.n}`}
            size="sm"
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() =>
              onOpen({ sourceId: quote.itemKey, title: quote.title, page: quote.page, passage: quote.text, bbox: union(quote.rects) })
            }
          >
            <CardHeader>
              <CardTitle>[{quote.n}] {quote.title}</CardTitle>
              <CardDescription>{byline(quote.authors, quote.year)}</CardDescription>
              <CardAction>
                <Badge variant="secondary">p. {quote.page}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <blockquote className="border-l-2 pl-3 text-sm leading-relaxed">{quote.text}</blockquote>
            </CardContent>
          </Card>
        ))
      ) : (
        <Notice icon={<SearchX />} title="No answer in your papers" description="No passage answers this question. Try Search to see what the library holds on it." />
      )}
      <p className="text-xs text-muted-foreground">{answer.model}</p>
    </>
  )
}
