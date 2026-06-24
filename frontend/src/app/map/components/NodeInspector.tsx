"use client"

import { X, FileText, AudioLines, ExternalLink } from "lucide-react"

import { type AtlasNode } from "./GraphView"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

export type Neighbor = { id: string; label: string; weight: number; direct: boolean }

export default function NodeInspector({
  node,
  neighbors,
  onClose,
  onOpenPdf,
  onNarrate,
  onSelectNeighbor,
}: {
  node: AtlasNode
  neighbors: Neighbor[]
  onClose: () => void
  onOpenPdf: (n: AtlasNode) => void
  onNarrate: (n: AtlasNode) => void
  onSelectNeighbor: (id: string) => void
}) {
  const isOwned = node.type === "owned"
  const authors = node.authors?.length
    ? node.authors.slice(0, 3).join(", ") + (node.authors.length > 3 ? " et al." : "")
    : null
  const doiUrl = node.doi ? `https://doi.org/${node.doi}` : null

  return (
    <div className="absolute top-4 right-4 z-10 w-[22rem] max-w-[calc(100%-2rem)]">
      <Card size="sm" className="gap-0 rounded-lg border py-0 shadow-xl ring-0">
        <CardHeader className="border-b p-4">
          <CardTitle className="pr-8 text-sm leading-snug">{node.label}</CardTitle>
          <CardDescription className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
            {authors ? <span>{authors}</span> : null}
            {node.year ? <span>{node.year}</span> : null}
            {node.globalCitedBy != null ? <span>{node.globalCitedBy} citations</span> : null}
            {!isOwned ? <span>external</span> : node.mapped === false ? <span>not in OpenAlex</span> : null}
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          {isOwned && node.clusterLabel ? <Badge variant="secondary">{node.clusterLabel}</Badge> : null}
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Most related
            </div>
            {neighbors.length > 0 ? (
              <ScrollArea className="max-h-40">
                <div className="flex flex-col gap-1 pr-2">
                  {neighbors.map((nb) => (
                    <Button
                      key={nb.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 px-2"
                      onClick={() => onSelectNeighbor(nb.id)}
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${nb.direct ? "bg-primary" : "bg-muted-foreground/40"}`}
                      />
                      <span className="flex-1 truncate text-left">{nb.label}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-xs text-muted-foreground">No related papers in view</div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex-wrap gap-2 bg-background p-3">
          {isOwned ? (
            <>
              <Button size="sm" onClick={() => onOpenPdf(node)}>
                <FileText /> Open PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNarrate(node)}>
                <AudioLines /> Narrate
              </Button>
            </>
          ) : null}
          {doiUrl ? (
            <a
              href={doiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink /> DOI
            </a>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  )
}
