"use client"

import { useState, useRef, useCallback, useEffect, Suspense } from "react"
import { Play, Pause, RotateCcw, RotateCw } from "lucide-react"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import type { PodcastDef } from "../types"
import styles from "./podcast-player.module.css"

const SIDEBAR_ITEMS = [
  { label: "Machine Learning Street Talk", href: "/podcasts/mlst" },
  { label: "TWIML AI Podcast", href: "/podcasts/twiml" },
  { label: "Gradient Dissent", href: "/podcasts/gradient-dissent" },
  { label: "Learning Bayesian Statistics", href: "/podcasts/learning-bayesian-statistics" },
]

function formatTime(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00"

  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)

  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`

  return `${m}:${String(s).padStart(2, "0")}`
}

function PodcastPlayerInner({ podcast }: { podcast: PodcastDef }) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const activeEpisode = podcast.episodes[activeIndex]

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current

    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }

    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const cycleRate = useCallback(() => {
    const rates = [1, 1.25, 1.5, 1.75, 2]
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length]

    setPlaybackRate(next)

    if (audioRef.current) audioRef.current.playbackRate = next
  }, [playbackRate])

  const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current
    const audio = audioRef.current

    if (!bar || !audio || !duration) return

    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))

    audio.currentTime = ratio * duration
    setCurrentTime(ratio * duration)
  }, [duration])

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current

    if (!audio) return

    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds))
  }, [])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) return

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration)
    const onEnd = () => setIsPlaying(false)

    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("ended", onEnd)

    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("ended", onEnd)
    }
  }, [activeIndex])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/podcasts"
        sectionTitle="Podcasts"
        contextItems={SIDEBAR_ITEMS}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader sidebarOpen={sidebarOpen} />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{podcast.name}</h1>
            <p className={styles.desc}>{podcast.desc}</p>
          </header>

          <main className={styles.main}>
            <div className={styles.player}>
              <audio
                ref={audioRef}
                key={activeEpisode.audioUrl}
                src={activeEpisode.audioUrl}
                preload="metadata"
              />

              <div className={styles.playerTop}>
                <span className={styles.playerTitle}>{activeEpisode.title}</span>
                <span className={styles.playerDate}>{activeEpisode.date}</span>
              </div>

              <div
                ref={progressRef}
                className={styles.progressBar}
                onClick={handleSeek}
              >
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>

              <div className={styles.playerControls}>
                <span className={styles.timeDisplay}>{formatTime(currentTime)}</span>

                <div className={styles.controlGroup}>
                  <button className={styles.skipBtn} onClick={() => skip(-15)} aria-label="Rewind 15s">
                    <RotateCcw size={16} strokeWidth={1.8} />
                  </button>

                  <button className={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                    {isPlaying ? (
                      <Pause size={18} strokeWidth={2} />
                    ) : (
                      <Play size={18} strokeWidth={2} style={{ marginLeft: 2 }} />
                    )}
                  </button>

                  <button className={styles.skipBtn} onClick={() => skip(30)} aria-label="Forward 30s">
                    <RotateCw size={16} strokeWidth={1.8} />
                  </button>
                </div>

                <div className={styles.controlRight}>
                  <button className={styles.rateBtn} onClick={cycleRate}>
                    {playbackRate}x
                  </button>
                  <span className={styles.timeDisplay}>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className={styles.episodeSection}>
              <div className={styles.episodeHeader}>
                <span className={styles.episodeHeading}>Episodes</span>
              </div>

              <div className={styles.episodeList}>
                {podcast.episodes.map((ep, index) => {
                  const isActive = index === activeIndex

                  return (
                    <button
                      key={ep.id}
                      className={`${styles.episodeRow} ${isActive ? styles.episodeRowActive : ""}`}
                      onClick={() => handleSelect(index)}
                    >
                      <div className={styles.episodeMain}>
                        <span className={styles.episodeTitle}>{ep.title}</span>
                        <div className={styles.episodeMeta}>
                          <span>{ep.date}</span>
                          {ep.duration && (
                            <>
                              <span className={styles.dot}>·</span>
                              <span>{ep.duration}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

export default function PodcastPlayer({ podcast }: { podcast: PodcastDef }) {
  return (
    <Suspense fallback={null}>
      <PodcastPlayerInner podcast={podcast} />
    </Suspense>
  )
}