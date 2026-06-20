"use client"

import Link from "next/link"
import type { MouseEvent } from "react"
import { useEffect, useRef, useState } from "react"
import styles from "@/components/landing/landing.module.css"

export type WorkflowNavItem = {
  id: string
  label: string
}

const NAV_SCROLL_DURATION_MS = 700

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

export default function WorkflowNav({ items }: { items: WorkflowNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "")
  const animationFrameRef = useRef<number | null>(null)

  function animateScrollTo(targetTop: number) {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    const startTop = window.scrollY
    const distance = targetTop - startTop
    const startTime = window.performance.now()

    function step(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / NAV_SCROLL_DURATION_MS, 1)
      const nextTop = startTop + distance * easeInOutCubic(progress)

      window.scrollTo({ top: nextTop, left: 0 })

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step)
      } else {
        animationFrameRef.current = null
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(step)
  }

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id)

    if (!section) return

    event.preventDefault()
    const scrollMarginTop = Number.parseFloat(window.getComputedStyle(section).scrollMarginTop)
    const targetTop =
      section.getBoundingClientRect().top +
      window.scrollY -
      (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0)

    animateScrollTo(Math.max(targetTop, 0))
    window.history.pushState(null, "", `#${id}`)
    setActiveId(id)
  }

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => Boolean(section))

    if (sections.length === 0) return

    let frameId: number | null = null

    function updateActiveSection() {
      frameId = null

      const activationY = window.scrollY + window.innerHeight * 0.38
      const current = sections.reduce<HTMLElement>((activeSection, section) => {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY

        return sectionTop <= activationY ? section : activeSection
      }, sections[0])

      if (current.id) {
        setActiveId(current.id)
      }
    }

    function scheduleUpdate() {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(updateActiveSection)
    }

    updateActiveSection()
    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
    }
  }, [items])

  return (
    <div className={styles.navLinks}>
      {items.map((item) => (
        <Link
          key={item.id}
          href={`#${item.id}`}
          onClick={(event) => handleNavClick(event, item.id)}
          className={activeId === item.id ? styles.navLinkActive : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
