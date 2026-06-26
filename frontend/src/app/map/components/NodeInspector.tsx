"use client"

import { X, FileText, AudioLines, ExternalLink } from "lucide-react"

import { type AtlasNode } from "./GraphView"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"

export default function NodeInspector({
  node,
  onClose,
  onOpenPdf,
  onNarrate,
}: {
  node: AtlasNode
  onClose: () => void
  onOpenPdf: (n: AtlasNode) => void
  onNarrate: (n: AtlasNode) => void
}) {
  const isOwned = node.type === "owned"
  const authors = node.authors?.length
    ? node.authors.slice(0, 3).join(", ") + (node.authors.length > 3 ? " et al." : "")
    : null
  const doiUrl = node.doi ? `https://doi.org/${node.doi}` : null
  const meta = [
    node.year ? String(node.year) : null,
    node.globalCitedBy != null ? `${node.globalCitedBy} citations` : null,
    !isOwned ? "external" : node.mapped === false ? "not in OpenAlex" : null,
  ].filter((value): value is string => Boolean(value))
  const details = meta.join(" · ")

  return (
    <div className="absolute top-4 right-4 z-10 w-[23rem] max-w-[calc(100%-2rem)]">
      <Card size="sm" className="max-h-[min(32rem,calc(100vh-6rem))] gap-0 overflow-hidden rounded-lg border bg-popover py-0 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
        <CardHeader
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b"
          style={{ padding: "1.125rem 1.25rem 1rem" }}
        >
          <div className="min-w-0 space-y-2.5">
            <CardTitle className="line-clamp-2 text-sm leading-snug">{node.label}</CardTitle>
            {authors ? <div className="truncate text-xs text-muted-foreground" title={authors}>{authors}</div> : null}
            {details ? <div className="truncate text-xs text-muted-foreground" title={details}>{details}</div> : null}
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
          className={`grid gap-3 border-t bg-background/80 ${isOwned ? "grid-cols-3" : "grid-cols-1"}`}
          style={{ padding: "1rem 1.25rem" }}
        >
          {isOwned ? (
            <>
              <Button size="sm" className="min-w-0" onClick={() => onOpenPdf(node)}>
                <FileText /> Open PDF
              </Button>
              <Button size="sm" variant="outline" className="min-w-0" onClick={() => onNarrate(node)}>
                <AudioLines /> Narrate
              </Button>
            </>
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
          ) : isOwned ? (
            <span aria-hidden />
          ) : null}
        </div>
      </Card>
    </div>
  )
}
