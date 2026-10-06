"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, List, Loader2 } from "lucide-react"

import {
  bundleFileUrl,
  fetchNarrationAnchors,
  fetchNarrationCues,
  fetchNarrationMeta,
  getProgress,
  putProgress,
  type Anchors,
  type Cue,
  type NarrationMeta,
} from "@/lib/api"
import ModeBar from "@/components/navigation/ModeBar"
import { startRebuild } from "@/lib/job"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ContentsPane, { buildOutline } from "./ContentsPane"
import NarrationPane from "./NarrationPane"
import SourcePane, { resolveHighlight } from "./SourcePane"
import TransportBar from "./TransportBar"
import styles from "./listen.module.css"
import { useMediaQuery } from "./useMediaQuery"
import { usePersisted } from "@/lib/usePersisted"

// Last cue starting at or before t. During the pause between sentences this keeps the one just
// spoken lit, which reads better than the highlight blinking off.
function findCue(cues: Cue[], t: number): number {
  let lo = 0
  let hi = cues.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= t) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

interface Track {
  voice: string
  file: string
  duration: number
  cues: Cue[] | null // fetched on first use; the primary voice's arrive with the page
}

export default function ListenReader() {
  const slug = useSearchParams().get("b") ?? ""

  const [meta, setMeta] = useState<NarrationMeta | null>(null)
  // Rebuilding is where a bad narration is actually noticed - a figure read aloud, a citation
  // bracket spoken - so it starts here, as the background job, in the bundle's own voice and speed.
  const showRebuild = useCallback(() => void startRebuild(slug), [slug])
  const [tracks, setTracks] = useState<Track[]>([])
  const [track, setTrack] = useState(0)
  const [anchors, setAnchors] = useState<Anchors | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(-1)
  const [rate, setRate] = useState("1")
  const [volume, setVolume] = useState(1)

  const [follow, setFollow] = usePersisted("inscien-listen-follow", true)
  const [contents, setContents] = usePersisted("inscien-listen-contents", true)
  const [paperOnly, setPaperOnly] = usePersisted("inscien-listen-paper-only", false)
  const [zoom, setZoom] = usePersisted("inscien-listen-zoom", 1)
  const [split, setSplit] = usePersisted("inscien-listen-split", 50)
  const [pane, setPane] = useState<"narration" | "paper">("narration")

  const audioRef = useRef<HTMLAudioElement>(null)
  const narrationRef = useRef<HTMLDivElement>(null)
  const narrationScrollRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  // A client that has not applied its resume seek does not know where it is and must not report
  // a position - otherwise a phone that failed to seek overwrites hours of progress with 0.
  const readyRef = useRef(false)
  const lastSavedRef = useRef(0)

  const wide = useMediaQuery("(min-width: 1024px)")
  const cues = tracks[track]?.cues ?? []
  const hasSource = Boolean(anchors?.images?.length)
  const outline = useMemo(() => buildOutline(cues), [cues])

  // ---- load the bundle -------------------------------------------------------------------
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    setError(null)
    Promise.all([fetchNarrationMeta(slug), fetchNarrationCues(slug), fetchNarrationAnchors(slug)])
      .then(([m, primaryCues, anchorData]) => {
        if (cancelled) return
        const voices = m.voices?.length ? m.voices : [m.voice]
        const durations = m.durations?.length ? m.durations : [m.duration_s]
        setMeta(m)
        setAnchors(anchorData)
        setTracks(
          voices.map((voice, i) => ({
            voice,
            // The first voice keeps the plain name, so every bundle built before multi-voice
            // still points at audio.mp3.
            file: i === 0 ? "audio.mp3" : `audio-${voice}.mp3`,
            duration: durations[i] ?? m.duration_s,
            cues: i === 0 ? primaryCues : null,
          }))
        )
        const remembered = voices.indexOf(
          window.localStorage.getItem(`inscien-listen-voice:${slug}`) ?? ""
        )
        if (remembered > 0) setTrack(remembered)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [slug])

  // A voice's cues are fetched the first time it is selected - they are only needed to light
  // the right sentence, and a paper's worth of timings per unused voice is dead weight.
  useEffect(() => {
    const t = tracks[track]
    if (!t || t.cues) return
    let cancelled = false
    fetchNarrationCues(slug, `cues-${t.voice}.json`)
      .then((c) => {
        if (cancelled) return
        setTracks((prev) => prev.map((x, i) => (i === track ? { ...x, cues: c } : x)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug, track, tracks])

  useEffect(() => {
    if (meta?.title) document.title = meta.title
  }, [meta])

  // ---- position, in the primary voice's clock ---------------------------------------------
  // Every voice says the same words at a different speed, so a position is only comparable
  // once converted. It is stored converted, everywhere: the server, the sidebar percent, here.
  const primaryDuration = tracks[0]?.duration ?? 0
  const trackDuration = tracks[track]?.duration ?? 0
  const toPrimary = useCallback(
    (t: number) => (trackDuration ? (t * primaryDuration) / trackDuration : t),
    [primaryDuration, trackDuration]
  )
  const fromPrimary = useCallback(
    (t: number) => (primaryDuration ? (t * trackDuration) / primaryDuration : t),
    [primaryDuration, trackDuration]
  )

  const savePosition = useCallback(
    (t: number, force = false) => {
      if (!readyRef.current || !slug) return
      if (!force && t - lastSavedRef.current < 5 && t > lastSavedRef.current) return
      lastSavedRef.current = t
      void putProgress(slug, { position: toPrimary(t) }).catch(() => {})
    },
    [slug, toPrimary]
  )

  // ---- audio wiring ------------------------------------------------------------------------
  const trackSrc = useMemo(() => {
    const t = tracks[track]
    if (!t || !slug) return ""
    // A rebuilt bundle keeps its slug, so its audio keeps its URL, and a browser with the old
    // mp3 cached would play it against corrected text. The primary track's duration in ms is a
    // build stamp: any rebuild that changed the audio changes the URL.
    const version = Math.round((tracks[0]?.duration ?? 0) * 1000)
    return `${bundleFileUrl(slug, t.file)}?v=${version}`
  }, [slug, track, tracks])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setTime(audio.currentTime)
      savePosition(audio.currentTime)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      // Defeat the throttle so a pause always commits where you actually stopped.
      lastSavedRef.current = 0
      savePosition(audio.currentTime, true)
    }
    const onMeta = () => setDuration(audio.duration)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("loadedmetadata", onMeta)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("loadedmetadata", onMeta)
    }
  }, [savePosition])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = parseFloat(rate)
  }, [rate, trackSrc])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    if (cues.length) setCurrent(findCue(cues, time))
  }, [time, cues])

  // ---- resume ------------------------------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!slug || !audio || !primaryDuration) return
    let done = false
    const seekTo = (stored: number) => {
      if (done) return
      done = true
      const local = fromPrimary(stored)
      if (local > 1) {
        audio.currentTime = local
        lastSavedRef.current = local
      }
      readyRef.current = true
    }
    void getProgress()
      .then((all) => {
        const stored = all[slug]?.position ?? 0
        // Seeking before the element has metadata is silently dropped on mobile, which is how a
        // phone starts at 0 and then clobbers the shared position.
        if (audio.readyState >= 1) seekTo(stored)
        else audio.addEventListener("loadedmetadata", () => seekTo(stored), { once: true })
        // preload=metadata can be ignored until a user gesture; do not stay blocked forever.
        window.setTimeout(() => seekTo(stored), 8000)
      })
      .catch(() => {
        readyRef.current = true
      })
    // Deliberately once per bundle: a voice switch carries its own position across.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, primaryDuration])

  // Pull the other device's position back when this tab returns, but never yank one that is
  // playing, and only past a difference worth moving for.
  useEffect(() => {
    if (!slug) return
    const refresh = async () => {
      const audio = audioRef.current
      if (!audio || !readyRef.current || !audio.paused) return
      try {
        const all = await getProgress()
        const t = fromPrimary(all[slug]?.position ?? 0)
        if (Math.abs(t - audio.currentTime) > 5) {
          audio.currentTime = t
          lastSavedRef.current = t
        }
      } catch {
        // offline for a moment; the next tick tries again
      }
    }
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    const timer = window.setInterval(() => void refresh(), 15000)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", () => void refresh())
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [slug, fromPrimary])

  // ---- controls ----------------------------------------------------------------------------
  const seekSeconds = useCallback((seconds: number, play = false) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    if (play) void audio.play()
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }, [])

  const stepCue = useCallback(
    (delta: number) => {
      if (!cues.length) return
      const next = Math.min(cues.length - 1, Math.max(0, current + delta))
      // +0.01 so the seek lands strictly inside the cue rather than on its boundary.
      seekSeconds(cues[next].start + 0.01)
    },
    [cues, current, seekSeconds]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag && ["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return
      if (e.code === "Space") {
        e.preventDefault()
        toggle()
      }
      if (e.key === "ArrowRight" || e.key === "j") stepCue(1)
      if (e.key === "ArrowLeft" || e.key === "k") stepCue(-1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [toggle, stepCue])

  // OS media keys and the lock screen - a three-hour listen gets paused from everywhere.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !meta) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: "InScien",
      album: "narrations",
    })
    navigator.mediaSession.setActionHandler("play", () => void audioRef.current?.play())
    navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      if (audioRef.current) audioRef.current.currentTime -= 15
    })
    navigator.mediaSession.setActionHandler("seekforward", () => {
      if (audioRef.current) audioRef.current.currentTime += 30
    })
  }, [meta])

  // Same moment in the paper, not the same number of seconds.
  const changeVoice = useCallback(
    (index: number) => {
      const audio = audioRef.current
      const at = audio ? toPrimary(audio.currentTime) : 0
      const nextDuration = tracks[index]?.duration ?? 0
      const local = primaryDuration && nextDuration ? (at * nextDuration) / primaryDuration : at
      const wasPlaying = Boolean(audio && !audio.paused)
      setTrack(index)
      window.localStorage.setItem(`inscien-listen-voice:${slug}`, tracks[index]?.voice ?? "")
      if (!audio) return
      const apply = () => {
        audio.currentTime = local
        if (wasPlaying) void audio.play()
      }
      // A fresh source means a fresh metadata load; seeking before it lands is dropped.
      if (audio.readyState >= 1) apply()
      else audio.addEventListener("loadedmetadata", apply, { once: true })
    },
    [primaryDuration, slug, toPrimary, tracks]
  )

  // ---- follow-along in the narration pane --------------------------------------------------
  // Marked by toggling classes rather than re-rendering: a three-hour paper is thousands of
  // spans and they change on every cue.
  useEffect(() => {
    const root = narrationRef.current
    if (!root || current < 0) return
    const spans = root.querySelectorAll<HTMLElement>("[data-i]")
    spans.forEach((el, i) => {
      el.classList.toggle(styles.on, i === current)
      el.classList.toggle(styles.past, i < current)
    })
    if (!follow) return
    const target = spans[current]
    const scroller = narrationScrollRef.current
    if (!target || !scroller) return
    const box = target.getBoundingClientRect()
    const view = scroller.getBoundingClientRect()
    // Only once the sentence has left a comfortable band, so the pane is not yanked on every
    // cue, and only this pane - never the window.
    if (box.top < view.top + 60 || box.bottom > view.bottom - 90) {
      scroller.scrollTop += box.top - view.top - view.height / 3
    }
  }, [current, follow, cues])

  const highlight = useMemo(() => resolveHighlight(cues, anchors, current), [cues, anchors, current])

  // ---- the splitter ------------------------------------------------------------------------
  const onSplitterDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const row = rowRef.current
      const narration = narrationScrollRef.current
      if (!row || !narration) return
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.style.userSelect = "none"
      // --split is the narration column's share of the WHOLE row, but the row starts at the
      // contents pane. Measure from the narration's own left edge or the boundary lands one
      // contents-width to the right of the pointer and jumps on the first click.
      const at = (clientX: number) => {
        const rect = row.getBoundingClientRect()
        const left = narration.getBoundingClientRect().left
        return Math.min(80, Math.max(20, ((clientX - left) / rect.width) * 100))
      }
      // Dragging writes straight to the DOM: the audio re-renders this tree on every
      // timeupdate, and a re-render mid-drag would snap the boundary back to the last
      // committed value. State is set once, on release.
      let latest = split
      const move = (ev: PointerEvent) => {
        latest = at(ev.clientX)
        row.style.setProperty("--split", `${latest}%`)
      }
      const up = (ev: PointerEvent) => {
        move(ev)
        document.body.style.userSelect = ""
        setSplit(latest)
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
    [setSplit, split]
  )

  // ---- render ------------------------------------------------------------------------------
  if (!slug) {
    return (
      <main className="flex h-svh flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">No narration selected.</p>
        <Button variant="outline" size="sm" render={<Link href="/map" />}>
          <ArrowLeft /> Back to the library
        </Button>
      </main>
    )
  }

  const jump = (start: number, cue: number) => {
    seekSeconds(start + 0.01)
    setCurrent(cue)
  }

  const showNarration = !hasSource || !paperOnly ? (wide ? true : pane === "narration") : false
  const showSource = hasSource && (wide ? true : pane === "paper" || paperOnly)
  const showContents = wide && contents && !paperOnly

  return (
    <main className="flex h-svh min-h-0 flex-col">
      <audio ref={audioRef} src={trackSrc} preload="metadata" />

      <ModeBar>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Back to the library"
          render={<Link href="/map" />}
        >
          <ArrowLeft />
        </Button>

        {!wide && outline.length > 0 ? (
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Contents" />}
            >
              <List />
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Contents</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-hidden px-4">
                <ContentsPane
                  outline={outline}
                  current={current}
                  onJump={(item) => jump(item.start, item.cue)}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : null}

        <TransportBar
          playing={playing}
          time={time}
          duration={duration}
          onToggle={toggle}
          onScrub={(s) => seekSeconds(s)}
          volume={volume}
          onVolume={setVolume}
          rate={rate}
          onRate={setRate}
          voices={tracks.map((t) => t.voice)}
          track={track}
          onTrack={changeVoice}
          follow={follow}
          onFollow={setFollow}
          hasSource={hasSource}
          contents={contents}
          onContents={setContents}
          paperOnly={paperOnly}
          onPaperOnly={setPaperOnly}
          onZoom={(d) => setZoom(Math.min(3, Math.max(0.6, Math.round((zoom + d) * 10) / 10)))}
          onRebuild={() => void showRebuild()}
        />
      </ModeBar>


      {/* One pane at a time below lg: two columns on a phone is worse than one. */}
      {hasSource && !wide && !paperOnly ? (
        <Tabs value={pane} onValueChange={(v) => setPane(v as "narration" | "paper")}>
          <TabsList className="mx-4 mt-3">
            <TabsTrigger value="narration">Narration</TabsTrigger>
            <TabsTrigger value="paper">Paper</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : !cues.length ? (
        <div className="flex flex-1 items-center justify-center gap-1.5 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading the narration...
        </div>
      ) : (
        <div
          ref={rowRef}
          className="flex min-h-0 flex-1"
          style={{ ["--split" as string]: `${split}%` }}
        >
          {showContents ? (
            <aside className="w-56 shrink-0 overflow-hidden border-r pl-4">
              <ContentsPane
                outline={outline}
                current={current}
                onJump={(item) => jump(item.start, item.cue)}
              />
            </aside>
          ) : null}

          {showNarration ? (
            <div
              ref={narrationScrollRef}
              className="min-w-0 overflow-y-auto px-6 py-6"
              style={hasSource && wide ? { flex: "0 0 var(--split)" } : { flex: "1 1 auto" }}
            >
              <NarrationPane
                cues={cues}
                containerRef={narrationRef}
                onSeek={(i) => seekSeconds(cues[i].start + 0.01, true)}
              />
            </div>
          ) : null}

          {showNarration && showSource && wide ? (
            <div className={styles.splitter} onPointerDown={onSplitterDown} title="drag to resize" />
          ) : null}

          {showSource && anchors ? (
            <div className="min-w-0 flex-1 px-4">
              <SourcePane
                slug={slug}
                anchors={anchors}
                highlight={highlight}
                zoom={zoom}
                follow={follow}
                paneRef={sourceRef}
              />
            </div>
          ) : null}
        </div>
      )}
    </main>
  )
}
