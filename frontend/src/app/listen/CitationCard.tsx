"use client"

import { ExternalLink, FileText } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Separator } from "@/components/ui/separator"
import type { CitationReference } from "@/lib/api"
import styles from "./listen.module.css"

// One reference, in the order the Map's node card uses: title, venue and year, citations, then
// the authors, and its links: Open PDF when the work is in Zotero (the Map in a new tab, with
// the PDF in its panel, so the narration keeps playing here), and a DOI or arXiv link. The
// title falls back to the entry as printed when the build could not parse one.
function Reference({ reference }: { reference: CitationReference }) {
  const published = [reference.venue, reference.year ? String(reference.year) : null].filter(Boolean).join(", ")
  const authors = reference.authors
  const link = reference.doi
    ? { href: `https://doi.org/${reference.doi}`, label: "DOI" }
    : reference.arxivId
      ? { href: `https://arxiv.org/abs/${reference.arxivId}`, label: "arXiv" }
      : null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-sm leading-snug font-medium break-words">
        <span className="text-muted-foreground">[{reference.n}]</span> {reference.title || reference.raw}
      </div>
      {published ? <div className="line-clamp-2 text-xs text-muted-foreground">{published}</div> : null}
      {reference.citedBy != null ? <div className="text-xs text-muted-foreground">{reference.citedBy} citations</div> : null}
      {authors.length ? (
        <div className="truncate text-xs text-foreground/80" title={authors.join(", ")}>
          {authors[0]}
          {authors.length > 1 ? " et al." : ""}
        </div>
      ) : null}
      {reference.itemKey || link ? (
        <div className="mt-1 flex gap-2">
          {reference.itemKey ? (
            <a
              href={`/map/?pdf=${encodeURIComponent(reference.itemKey)}&title=${encodeURIComponent(reference.title || "")}`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "xs" })}
            >
              <FileText /> Open PDF
            </a>
          ) : null}
          {link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "xs" })}
            >
              <ExternalLink /> {link.label}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// The hover target over one line of a marker on the page image, and the card it opens: every
// reference the marker names, one under the other.
export default function CitationCard({ style, references }: { style: React.CSSProperties; references: CitationReference[] }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        render={<span className={styles.cite} style={style} aria-label={`Citation: ${references.map((r) => r.n).join(", ")}`} />}
      />
      <HoverCardContent side="top" className="flex max-h-80 w-80 flex-col gap-3 overflow-y-auto">
        {references.map((reference, i) => (
          <div key={reference.n} className="flex flex-col gap-3">
            {i > 0 ? <Separator /> : null}
            <Reference reference={reference} />
          </div>
        ))}
      </HoverCardContent>
    </HoverCard>
  )
}
