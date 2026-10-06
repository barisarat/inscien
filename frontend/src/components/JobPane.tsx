"use client"

// The job pane: the one background job (a build or a narration), bottom right on every page.
// Shows the paper, the step, a percent when the step reports one, the last log lines and
// Cancel. A finished job stays until dismissed.
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cancelCurrentJob, dismissJob, useDismissedJobId, useJob } from "@/lib/job"

const KIND = { build: "Building", narrate: "Narrating" } as const

export default function JobPane() {
  const job = useJob()
  const dismissed = useDismissedJobId()

  if (!job || (job.status !== "running" && dismissed === job.id)) return null
  const running = job.status === "running"
  const state = running
    ? `step ${job.step}/${job.steps}: ${job.stepLabel}${job.percent != null ? ` - ${job.percent}%` : ""}`
    : job.status === "done"
      ? "done"
      : job.status === "cancelled"
        ? "cancelled"
        : `failed - ${job.error ?? "see the log"}`

  return (
    <div className="fixed right-4 bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-3 text-xs shadow-lg">
      <div className="flex items-start gap-2">
        {running ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" /> : null}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {KIND[job.kind]}: {job.title}
          </div>
          <div className="text-muted-foreground">{state}</div>
        </div>
        {running ? (
          <Button variant="outline" size="xs" onClick={() => void cancelCurrentJob()}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={() => dismissJob(job.id)}
          >
            <X />
          </Button>
        )}
      </div>
      {running && job.percent != null ? (
        <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
          <div className="h-full bg-foreground transition-all" style={{ width: `${job.percent}%` }} />
        </div>
      ) : null}
      {job.log.length && job.status !== "done" ? (
        <pre className="mt-2 max-h-28 overflow-auto rounded bg-muted p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap">
          {job.log.slice(-6).join("\n")}
        </pre>
      ) : null}
    </div>
  )
}
