"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, Headphones, X, FileText, ExternalLink } from "lucide-react"

import { type AtlasNode } from "./GraphView"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"

export default function NodeInspector({
  node,
  onClose,
  onOpenPdf,
}: {
  node: AtlasNode
  onClose: () => void
  onOpenPdf: (n: AtlasNode) => void
}) {
  const isOwned = node.type === "owned"
  // A reference card, one fact per line: title, venue and year, citations, then the first
  // author with a chevron that unfolds the full list. The list folds again on a new node.
  // Folded state is keyed by node id rather than reset in an effect, so a new node starts folded.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const authorsOpen = openFor === node.id
  const authors = node.authors ?? []
  const doiUrl = node.doi ? `https://doi.org/${node.doi}` : null
  const published = [node.venue || null, node.year ? String(node.year) : null]
    .filter((value): value is string => Boolean(value))
    .join(", ")
  const citations = node.globalCitedBy != null ? `${node.globalCitedBy} citations` : null
  // The exact figure behind the segmented ring. The arcs are countable to four and then stop
  // counting, and no digit is drawn on the canvas (labels collide), so this line is where the
  // number lives.
  const sharedBy = !isOwned && (node.citedBy ?? 0) > 1 ? `shared by ${node.citedBy} of your papers` : null
  // Tailwind needs the column class spelled out, so count the buttons and pick one.
  const buttons = [isOwned, Boolean(doiUrl), Boolean(node.narrationUrl)].filter(Boolean).length
  const columns = buttons >= 3 ? "grid-cols-3" : buttons === 2 ? "grid-cols-2" : "grid-cols-1"

  return (
    <div className="absolute top-4 right-4 z-10 w-[23rem] max-w-[calc(100%-2rem)]">
      <Card size="sm" className="max-h-[min(32rem,calc(100vh-6rem))] gap-0 overflow-hidden rounded-lg border bg-popover py-0 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
        <CardHeader
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b"
          style={{ padding: "1.125rem 1.25rem 1rem" }}
        >
          <div className="min-w-0 space-y-2.5">
            <CardTitle className="text-sm leading-snug break-words">{node.label}</CardTitle>
            {published ? <div className="line-clamp-2 text-xs leading-4 text-muted-foreground" title={published}>{published}</div> : null}
            {citations ? <div className="text-xs leading-4 text-muted-foreground">{citations}</div> : null}
            {sharedBy ? <div className="text-xs leading-4 text-muted-foreground">{sharedBy}</div> : null}
            {authors.length > 0 ? (
              authorsOpen ? (
                <div className="text-xs leading-4 text-foreground/80">{authors.join(", ")}</div>
              ) : (
                <div className="flex min-w-0 items-center gap-1 text-xs leading-4 text-foreground/80">
                  <span className="truncate">{authors[0]}{authors.length > 1 ? " et al." : ""}</span>
                  {authors.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-label={`Show all ${authors.length} authors`}
                      onClick={() => setOpenFor(node.id)}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              )
            ) : null}
          </div>
          <CardAction>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </CardAction>
        </CardHeader>

        {isOwned && (node.collection || node.clusterLabel) ? (
          <CardContent
            className="min-h-0 flex-1 space-y-2.5"
            style={{ padding: "1rem 1.25rem" }}
          >
            {node.collection ? (
              <div className="truncate text-xs text-muted-foreground" title={node.collection}>
                Collection: <span className="text-foreground">{node.collection}</span>
              </div>
            ) : null}
            {node.clusterLabel ? (
              <div className="truncate text-xs text-muted-foreground" title={node.clusterLabel}>
                Cluster: <span className="text-foreground">{node.clusterLabel}</span>
              </div>
            ) : null}
          </CardContent>
        ) : null}

        <div
          className={`grid gap-3 border-t bg-background/80 ${columns}`}
          style={{ padding: "1rem 1.25rem" }}
        >
          {isOwned ? (
            <Button size="sm" className="min-w-0" onClick={() => onOpenPdf(node)}>
              <FileText /> Open PDF
            </Button>
          ) : null}
          {doiUrl ? (
            <a
              href={doiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm", className: "min-w-0" })}
            >
              <ExternalLink /> DOI
            </a>
          ) : null}
          {node.narrationUrl ? (
            <Link
              href={node.narrationUrl}
              className={buttonVariants({ variant: "outline", size: "sm", className: "min-w-0" })}
            >
              <Headphones /> Listen
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
