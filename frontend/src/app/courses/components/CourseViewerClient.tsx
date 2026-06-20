"use client"

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import AppSidebar from "@/components/navigation/AppSidebar"
import AppTopHeader from "@/components/navigation/AppTopHeader"
import { useSidebar } from "@/lib/SidebarProvider"
import { useAuth } from "@/lib/auth"
import {
  fetchCourseDetail,
  updateCoursePartProgress,
  type CourseDetail,
  type CourseLecturePart,
} from "@/lib/api"
import styles from "./course-viewer.module.css"

type ActiveRef = { groupIndex: number; partIndex: number }
type SidebarItem = { label: string; href: string }

function flattenParts(course: CourseDetail): { part: CourseLecturePart; groupIndex: number; partIndex: number }[] {
  const flat: { part: CourseLecturePart; groupIndex: number; partIndex: number }[] = []

  course.lectures.forEach((group, gi) => {
    group.parts.forEach((part, pi) => {
      flat.push({ part, groupIndex: gi, partIndex: pi })
    })
  })

  return flat
}

function lectureKey(lectureId: string, index: number) {
  return `${lectureId}-${index}`
}

function getLectureDisplayLabel(title: string, index: number) {
  const match = title.match(/^Lecture\s+([0-9]+[A-Za-z]?)/i)

  if (match) {
    return `Lecture ${match[1]}`
  }

  return `Lecture ${index + 1}`
}

function getPlayerPartTitle(title: string) {
  return title.replace(/^Lecture\s+[0-9]+[A-Za-z]?\s*[:.-]\s*/i, "")
}

function getInitialCollapsed(course: CourseDetail) {
  return new Set(course.lectures.slice(1).map((lecture, index) => lectureKey(lecture.id, index + 1)))
}

function updatePartCompletedState(
  course: CourseDetail,
  partId: string,
  completed: boolean
): CourseDetail {
  return {
    ...course,
    lectures: course.lectures.map((lecture) => ({
      ...lecture,
      parts: lecture.parts.map((part) => {
        if (part.id !== partId) return part

        return {
          ...part,
          completed,
        }
      }),
    })),
  }
}

export default function CourseViewerClient({
  courseSlug,
  initialCourse,
  initialSidebarItems,
}: {
  courseSlug: string
  initialCourse: CourseDetail
  initialSidebarItems: SidebarItem[]
}) {
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const { isLoading: authLoading, isAuthenticated, login } = useAuth()

  const [course, setCourse] = useState<CourseDetail>(initialCourse)
  const [sidebarItems] = useState<SidebarItem[]>(initialSidebarItems)
  const [active, setActive] = useState<ActiveRef>({ groupIndex: 0, partIndex: 0 })
  const [collapsed, setCollapsed] = useState<Set<string>>(() => getInitialCollapsed(initialCourse))
  const [updatingPartIds, setUpdatingPartIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setCourse(initialCourse)
    setActive({ groupIndex: 0, partIndex: 0 })
    setCollapsed(getInitialCollapsed(initialCourse))
  }, [initialCourse])

  useEffect(() => {
    if (authLoading || !isAuthenticated) return

    let cancelled = false

    async function hydrateUserProgress() {
      try {
        const data = await fetchCourseDetail(course.slug)

        if (!cancelled) {
          setCourse(data)
        }
      } catch {
      }
    }

    hydrateUserProgress()

    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, course.slug])

  const flat = useMemo(() => {
    return flattenParts(course)
  }, [course])

  const activePart = course.lectures[active.groupIndex]?.parts[active.partIndex]
  const activeGroup = course.lectures[active.groupIndex]

  const flatIndex = useMemo(() => {
    return flat.findIndex((f) => f.groupIndex === active.groupIndex && f.partIndex === active.partIndex)
  }, [flat, active])

  const totalParts = flat.length

  const activeLectureLabel = activeGroup
    ? getLectureDisplayLabel(activeGroup.title, active.groupIndex)
    : ""

  const activePartTitle = activePart
    ? getPlayerPartTitle(activePart.title)
    : ""

  const handleSelect = useCallback((groupIndex: number, partIndex: number) => {
    setActive({ groupIndex, partIndex })
  }, [])

  const handlePartKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, groupIndex: number, partIndex: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        handleSelect(groupIndex, partIndex)
      }
    },
    [handleSelect]
  )

  const handleNext = useCallback(() => {
    if (flatIndex < flat.length - 1) {
      const next = flat[flatIndex + 1]
      handleSelect(next.groupIndex, next.partIndex)
    }
  }, [flatIndex, flat, handleSelect])

  const handlePrev = useCallback(() => {
    if (flatIndex > 0) {
      const prev = flat[flatIndex - 1]
      handleSelect(prev.groupIndex, prev.partIndex)
    }
  }, [flatIndex, flat, handleSelect])

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)

      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }

      return next
    })
  }, [])

  const handleToggleCompleted = useCallback(
    async (
      event: MouseEvent<HTMLButtonElement>,
      groupIndex: number,
      partIndex: number
    ) => {
      event.stopPropagation()

      if (!isAuthenticated) {
        login(window.location.pathname)
        return
      }

      const part = course.lectures[groupIndex]?.parts[partIndex]

      if (!part) return

      const nextCompleted = !part.completed

      setCourse((prev) => {
        return updatePartCompletedState(prev, part.id, nextCompleted)
      })

      setUpdatingPartIds((prev) => {
        const next = new Set(prev)
        next.add(part.id)
        return next
      })

      try {
        await updateCoursePartProgress(course.slug, part.id, nextCompleted)
      } catch {
        setCourse((prev) => {
          return updatePartCompletedState(prev, part.id, part.completed)
        })
      } finally {
        setUpdatingPartIds((prev) => {
          const next = new Set(prev)
          next.delete(part.id)
          return next
        })
      }
    },
    [course, isAuthenticated, login]
  )

  if (!activePart || !activeGroup) {
    return (
      <div className={styles.pageShell}>
        <AppSidebar
          brandHref="/courses"
          sectionTitle="Courses"
          contextItems={sidebarItems}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
        />

        <AppTopHeader sidebarOpen={sidebarOpen} />

        <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
          <div className={styles.page}>
            <header className={styles.header}>
              <h1 className={styles.title}>{course.name}</h1>
              <p className={styles.desc}>This course has no lecture parts yet.</p>
            </header>

            <div className={styles.pageEndSpacer} aria-hidden="true" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageShell}>
      <AppSidebar
        brandHref="/courses"
        sectionTitle="Courses"
        contextItems={sidebarItems}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

      <AppTopHeader sidebarOpen={sidebarOpen} />

      <div className={`${styles.mainContent} ${sidebarOpen ? styles.mainContentOpen : styles.mainContentClosed}`}>
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>{course.name}</h1>
            <p className={styles.desc}>{course.desc}</p>
          </header>

          <main className={styles.main}>
            <div className={styles.playerSection}>
              <div className={styles.playerWrap}>
                <iframe
                  key={activePart.videoId}
                  className={styles.iframe}
                  src={`https://www.youtube.com/embed/${activePart.videoId}?rel=0&modestbranding=1`}
                  title={activePartTitle}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>

              <div className={styles.playerBar}>
                <div className={styles.nowPlaying}>
                  <span className={styles.nowGroup}>{activeLectureLabel}</span>
                  <span className={styles.nowTitle}>{activePartTitle}</span>
                </div>
                <div className={styles.playerNav}>
                  <button
                    className={styles.navBtn}
                    onClick={handlePrev}
                    disabled={flatIndex === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Prev
                  </button>
                  <span className={styles.navCounter}>{flatIndex + 1} / {totalParts}</span>
                  <button
                    className={styles.navBtn}
                    onClick={handleNext}
                    disabled={flatIndex === flat.length - 1}
                  >
                    Next
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.lectureSection}>
              {course.lectures.map((group, gi) => {
                const groupKey = lectureKey(group.id, gi)
                const isCollapsed = collapsed.has(groupKey)

                return (
                  <div key={groupKey} className={styles.lectureGroup}>
                    <button
                      className={styles.groupHeader}
                      onClick={() => toggleGroup(groupKey)}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        className={`${styles.chevron} ${isCollapsed ? styles.chevronCollapsed : ""}`}
                      >
                        <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className={styles.groupTitle}>{group.title}</span>
                    </button>

                    {!isCollapsed && (
                      <div className={styles.partsList}>
                        {group.parts.map((part, pi) => {
                          const isActive = gi === active.groupIndex && pi === active.partIndex
                          const isUpdating = updatingPartIds.has(part.id)
                          const partKey = `${groupKey}-${part.id}-${pi}`

                          return (
                            <div
                              key={partKey}
                              role="button"
                              tabIndex={0}
                              className={`${styles.partRow} ${isActive ? styles.partRowActive : ""} ${part.completed ? styles.partRowCompleted : ""}`}
                              onClick={() => handleSelect(gi, pi)}
                              onKeyDown={(event) => handlePartKeyDown(event, gi, pi)}
                            >
                              <span className={styles.partTitle}>{part.title}</span>

                              <button
                                type="button"
                                className={`${styles.completionButton} ${part.completed ? styles.completionButtonCompleted : ""} ${isUpdating ? styles.completionButtonUpdating : ""}`}
                                aria-label={part.completed ? "Mark lecture part as not completed" : "Mark lecture part as completed"}
                                aria-pressed={part.completed}
                                onClick={(event) => handleToggleCompleted(event, gi, pi)}
                                disabled={isUpdating}
                              >
                                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                                  <path d="M12.5 4.75L6.75 10.5L3.5 7.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </main>

          <div className={styles.pageEndSpacer} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}