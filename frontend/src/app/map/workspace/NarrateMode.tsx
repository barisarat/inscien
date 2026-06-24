"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AudioLines, Download, Loader2, Settings } from "lucide-react"

import {
  activeNarration,
  getModelOptions,
  getNarration,
  getNarrateModel,
  getNarrateModelDownload,
  getSettings,
  listNarrations,
  listPapers,
  startNarration,
  startNarrateModelDownload,
  API_BASE,
} from "@/lib/api"
import { useZoteroSelection } from "@/lib/ZoteroSelectionProvider"
import { useWorkspace } from "./WorkspaceProvider"
import { useSkillJob, JobProgress, JobError } from "./skillJob"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type Phase = "idle" | "running" | "done" | "error"

export default function NarrateMode() {
  const { selectedKeys } = useZoteroSelection()
  const { activeArtifact } = useWorkspace()
  const loaded = activeArtifact?.kind === "narration" ? activeArtifact : null
  const keys = Array.from(selectedKeys)
  const docId = loaded ? loaded.docId : keys.length === 1 ? keys[0] : null

  const [phase, setPhase] = useState<Phase>("idle")
  const [title, setTitle] = useState("")
  const [jobId, setJobId] = useState("")
  // null = not yet checked; gates the Generate button on a configured/reachable narration model.
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  // Kokoro voice weights: null = not yet checked. The desktop build doesn't bundle them, so the
  // user downloads them once (with progress) before the first narration; gates Generate too.
  const [ttsReady, setTtsReady] = useState<boolean | null>(null)
  const [dlPhase, setDlPhase] = useState<"idle" | "downloading" | "error">("idle")
  const { progress, setProgress, error, setError, newRun, isStale, track } = useSkillJob()
  const dl = useSkillJob()

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

  // Gate the Generate button on a configured/reachable narration model (narration is the only
  // feature that needs a model). Independent of the resume logic above so a settings hiccup
  // never blocks replaying an existing narration.
  useEffect(() => {
    if (loaded || !docId) {
      setModelReady(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [settings, models] = await Promise.all([getSettings(), getModelOptions()])
        if (cancelled) return
        setModelReady(
          settings.llmProvider === "openai"
            ? settings.openAiApiKeyPresent && !!settings.llmModel
            : models.ollamaReachable && models.options.length > 0,
        )
      } catch {
        if (!cancelled) setModelReady(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, loaded])

  // Voice-weights presence check, gated like modelReady (only when about to generate, never when
  // replaying a saved mp3). Independent of modelReady so each gate surfaces its own fix.
  useEffect(() => {
    if (loaded || !docId) {
      setTtsReady(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { present } = await getNarrateModel()
        if (!cancelled) setTtsReady(present)
      } catch {
        if (!cancelled) setTtsReady(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [docId, loaded])

  const downloadModel = useCallback(async () => {
    const token = dl.newRun()
    setDlPhase("downloading")
    try {
      const { jobId: id } = await startNarrateModelDownload()
      if (dl.isStale(token)) return
      await dl.track(token, id, getNarrateModelDownload, {
        onDone: () => {
          setTtsReady(true)
          setDlPhase("idle")
        },
        onError: () => setDlPhase("error"),
        fallbackError: "Voice-model download failed.",
      })
    } catch (e) {
      if (dl.isStale(token)) return
      dl.setError(String(e))
      setDlPhase("error")
    }
  }, [dl])

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
      <div className="flex w-full flex-col items-center gap-3">
        <audio className="w-full" controls autoPlay={autoPlay} src={url} />
        <a href={url} download className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 !px-8" })}>
          <Download /> Download mp3
        </a>
      </div>
    )
  }

  const header = (
    <div
      className="flex h-13 shrink-0 items-center gap-2 border-b bg-background text-sm"
      style={{ paddingLeft: "3.5rem", paddingRight: "2rem" }}
    >
      <span className="font-medium">Narrate</span>
      {phase === "running" ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Generating...
        </span>
      ) : loaded || phase === "done" ? (
        <Badge variant="secondary" className="shrink-0">Ready</Badge>
      ) : phase === "error" ? (
        <Badge variant="destructive" className="shrink-0">Error</Badge>
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
      note="Generating audio in the background (a few minutes) - you can keep working."
    />
  ) : phase === "done" ? (
    audioBlock(jobId)
  ) : phase === "error" ? (
    <JobError error={error} onRetry={run} />
  ) : modelReady === false ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Narration needs a language model. Connect a local Ollama model or an OpenAI key in Settings.
      </p>
      <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2 !px-8" })}>
        <Settings /> Open Settings
      </Link>
    </div>
  ) : dlPhase === "downloading" ? (
    <JobProgress
      progress={dl.progress}
      fallback="Downloading voice model"
      minPct={2}
      defaultPct={0}
      note="Downloading the narration voice (~1 GB, one time) - you can keep working."
    />
  ) : dlPhase === "error" ? (
    <JobError error={dl.error} onRetry={downloadModel} retryLabel="Retry download" />
  ) : ttsReady === false ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        Narration uses a local voice model (<span className="whitespace-nowrap">~1 GB</span>). Download it
        once to enable spoken audio - it stays on your machine for every future narration.
      </p>
      <Button className="gap-2 !px-8" onClick={downloadModel}>
        <Download /> Download narration voice
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        The narration job runs in the background and will be saved for replay.
      </p>
      <Button className="gap-2 !px-8" onClick={run}>
        <AudioLines /> Generate narration
      </Button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-6 py-8">
        <section className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <div className="flex max-w-full flex-col items-center gap-1.5">
            <h3 className="max-w-full text-base leading-snug font-medium">{cardTitle}</h3>
            <p className="text-sm text-muted-foreground">{cardDescription}</p>
          </div>
          <div className="flex w-full flex-col items-center">{cardContent}</div>
        </section>
      </div>
    </div>
  )
}
