"use client"

import { useState } from "react"
import { AudioLines, List, Pause, Play, Volume2, ZoomIn, ZoomOut, FileText, ScanEye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const RATES = ["0.9", "1", "1.1", "1.25", "1.5"]

export function clock(t: number): string {
  if (!Number.isFinite(t)) return "0:00"
  const s = Math.floor(t % 60)
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const mm = h ? String(m).padStart(2, "0") : String(m)
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

export default function TransportBar({
  playing,
  time,
  duration,
  onToggle,
  onScrub,
  volume,
  onVolume,
  rate,
  onRate,
  voices,
  track,
  onTrack,
  follow,
  onFollow,
  hasSource,
  contents,
  onContents,
  paperOnly,
  onPaperOnly,
  onZoom,
  onRebuild,
}: {
  playing: boolean
  time: number
  duration: number
  onToggle: () => void
  onScrub: (seconds: number) => void
  volume: number
  onVolume: (v: number) => void
  rate: string
  onRate: (r: string) => void
  voices: string[]
  track: number
  onTrack: (i: number) => void
  follow: boolean
  onFollow: (on: boolean) => void
  hasSource: boolean
  contents: boolean
  onContents: (on: boolean) => void
  paperOnly: boolean
  onPaperOnly: (on: boolean) => void
  onZoom: (delta: number) => void
  // Starts the background job that rebuilds this narration. Absent: the button is not rendered.
  onRebuild?: () => void
}) {
  // While a drag is in flight the slider shows the dragged value and the audio does not move -
  // committing on every pointer move fights the user and stutters a 130MB range-requested mp3.
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? time

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="shrink-0"
      >
        {playing ? <Pause /> : <Play />}
      </Button>

      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clock(shown)}</span>
      <Slider
        className="min-w-24 flex-1"
        value={duration > 0 ? Math.min(shown, duration) : 0}
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.1}
        onValueChange={(v) => setScrub(Array.isArray(v) ? v[0] : v)}
        onValueCommitted={(v) => {
          const next = Array.isArray(v) ? v[0] : v
          setScrub(null)
          onScrub(next)
        }}
        aria-label="Seek"
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clock(duration)}</span>


      {/* The width lives on the wrapper: the slider root is w-full under its horizontal
          variant, so a width set on the slider itself resolves against a shrink-to-fit parent
          and collapses the track to just the thumb. */}
      <div className="hidden w-32 shrink-0 items-center gap-2 sm:flex">
        <Volume2 className="size-4 shrink-0 text-muted-foreground" />
        <Slider
          value={volume}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => onVolume(Array.isArray(v) ? v[0] : v)}
          aria-label="Volume"
        />
      </div>

      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              variant="segment"
              size="sm"
              pressed={follow}
              onPressedChange={onFollow}
              className="shrink-0"
              aria-label="Follow the narration"
            />
          }
        >
          <ScanEye />
        </TooltipTrigger>
        <TooltipContent>Follow the narration</TooltipContent>
      </Tooltip>

      {hasSource ? (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  variant="segment"
                  size="sm"
                  pressed={contents}
                  onPressedChange={onContents}
                  className="hidden shrink-0 lg:inline-flex"
                  aria-label="Contents"
                />
              }
            >
              <List />
            </TooltipTrigger>
            <TooltipContent>Contents</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  variant="segment"
                  size="sm"
                  pressed={paperOnly}
                  onPressedChange={onPaperOnly}
                  className="hidden shrink-0 lg:inline-flex"
                  aria-label="Paper only"
                />
              }
            >
              <FileText />
            </TooltipTrigger>
            <TooltipContent>Paper only</TooltipContent>
          </Tooltip>

          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <Button variant="ghost" size="icon-sm" onClick={() => onZoom(-0.2)} aria-label="Zoom out">
              <ZoomOut />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onZoom(0.2)} aria-label="Zoom in">
              <ZoomIn />
            </Button>
          </div>
        </>
      ) : null}

      {onRebuild ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={onRebuild}
                aria-label="Rebuild this narration"
              />
            }
          >
            <AudioLines />
          </TooltipTrigger>
          <TooltipContent>Rebuild this narration, same voice and speed</TooltipContent>
        </Tooltip>
      ) : null}

      {voices.length > 1 ? (
        <Select value={String(track)} onValueChange={(v) => v && onTrack(Number(v))}>
          <SelectTrigger size="sm" className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {voices.map((v, i) => (
              <SelectItem key={v} value={String(i)}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select value={rate} onValueChange={(v) => v && onRate(v)}>
        <SelectTrigger size="sm" className="w-20 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RATES.map((r) => (
            <SelectItem key={r} value={r}>
              {r}x
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
