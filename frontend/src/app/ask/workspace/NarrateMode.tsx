"use client"

import { useCallback, useEffect, useState } from "react"
import { AudioLines, Download, Loader2 } from "lucide-react"

import { activeNarration, getNarration, listNarrations, listPapers, startNarration, API_BASE } from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob, JobProgress, JobError } from "./skillJob"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Phase = "idle" | "running" | "done" | "error"

const workspaceRowStyle = { paddingLeft: 24, paddingRight: 24 }
const bodyStyle = { paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 24 }

export default function NarrateMode() {
  const { selectedKeys } = useZoteroSelection()
  const { activeArtifact } = useWorkspace()
  const loaded = activeArtifact?.kind === "narration" ? activeArtifact : null
  const keys = Array.from(selectedKeys)
  const docId = loaded ? loaded.docId : keys.length === 1 ? keys[0] : null

  const [phase, setPhase] = useState<Phase>("idle")
  const [title, setTitle] = useState("")
  const [jobId, setJobId] = useState("")
  const { progress, setProgress, error, setError, newRun, isStale, track } = useSkillJob()

  const attach = useCallback((id: string, token: number) =>
    track(token, id, getNarration, {
      onProgress: (s) => { if (s.title) setTitle(s.title) },
      onDone: () => setPhase("done"),
      onError: () => setPhase("error"),
      fallbackError: "Narration failed.",
    }), [track])

  useEffect(() => {
    const token = newRun()
    setPhase("idle")
    setJobId("")
    setTitle("")
    if (loaded || !docId) return
    void (async () => {
      try {
        const [{ papers }, { job }] = await Promise.all([listPapers(), activeNarration(docId)])
        if (isStale(token)) return
        setTitle(papers.find((p) => p.docId === docId)?.title || "")
        if (job) {
          setJobId(job.id)
          if (job.title) setTitle(job.title)
          setProgress({ stage: job.stage, detail: job.detail, progress: job.progress })
          setPhase("running")
          void attach(job.id, token)
          return
        }
        const { items } = await listNarrations()
        if (isStale(token)) return
        const existing = items.find((n) => n.docId === docId)
        if (existing) {
          setJobId(existing.jobId)
          setPhase("done")
        }
      } catch {
        /* leave idle; the user can generate manually */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, loaded])

  const run = useCallback(async () => {
    if (!docId) return
    const token = newRun()
    setPhase("running")
    try {
      const res = await startNarration({ docId })
      if (isStale(token)) return
      setJobId(res.jobId)
      if (res.title) setTitle(res.title)
      await attach(res.jobId, token)
    } catch (e) {
      if (isStale(token)) return
      setError(String(e))
      setPhase("error")
    }
  }, [docId, attach, newRun, isStale, setError])

  const audioBlock = (id: string, autoPlay = false) => {
    const url = `${API_BASE}/api/narrate/${encodeURIComponent(id)}/audio`
    return (
      <div className="flex flex-col gap-3">
        <audio className="w-full" controls autoPlay={autoPlay} src={url} />
        <a href={url} download className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download /> Download mp3
        </a>
      </div>
    )
  }

  const status =
    loaded || phase === "done" ? "Ready" : phase === "running" ? "Generating" : phase === "error" ? "Error" : "Ready to generate"

  const header = (
    <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b py-2" style={workspaceRowStyle}>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">Narrate</h2>
      </div>
      {phase !== "idle" ? (
        <Badge variant={phase === "error" ? "destructive" : "secondary"} className="shrink-0">
          {phase === "running" ? <Loader2 className="animate-spin" /> : null}
          {status}
        </Badge>
      ) : null}
    </div>
  )

  const cardTitle = loaded ? loaded.title || "Narration" : docId ? title || "Selected paper" : "Select one paper"
  const cardDescription = loaded
    ? "Saved narration is ready to play."
    : docId
      ? "Generate a spoken-audio narration of this paper."
      : "Choose exactly one library item to prepare narration."

  const cardContent = loaded ? (
    audioBlock(loaded.jobId, true)
  ) : !docId ? (
    <p className="text-sm text-muted-foreground">{keys.length} selected</p>
  ) : phase === "running" ? (
    <JobProgress
      progress={progress}
      fallback="Generating audio"
      minPct={2}
      defaultPct={0}
      note="Generating audio in the background (a few minutes) — you can keep working."
    />
  ) : phase === "done" ? (
    audioBlock(jobId)
  ) : phase === "error" ? (
    <JobError error={error} onRetry={run} />
  ) : (
    <div className="flex flex-col items-start gap-5">
      <p className="text-sm text-muted-foreground">
        The narration job runs in the background and will be saved for replay.
      </p>
      <Button onClick={run}>
        <AudioLines /> Generate narration
      </Button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-auto" style={bodyStyle}>
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>{cardTitle}</CardTitle>
              <CardDescription>{cardDescription}</CardDescription>
            </CardHeader>
            <CardContent>{cardContent}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
