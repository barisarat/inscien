"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react"
import { type ChatSessionSummary } from "@/lib/api"
import styles from "./RecentsControl.module.css"

type Props = {
  sessions: ChatSessionSummary[]
  activeSessionId: number | null
  onNew: () => void
  onRename: (id: number, currentTitle: string) => void
  onDelete: (id: number) => void
  onOpen?: () => void
}

export default function RecentsControl({ sessions, activeSessionId, onNew, onRename, onDelete, onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q))
  }, [sessions, query])

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen((v) => {
            if (!v) onOpen?.()
            return !v
          })
        }}
      >
        History
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className={styles.menu}>
          <div className={styles.menuHead}>
            <input
              className={styles.search}
              placeholder="Search history…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={styles.newBtn}
              onClick={() => {
                onNew()
                setOpen(false)
              }}
              title="New conversation"
            >
              <Plus size={15} />
            </button>
          </div>

          <div className={styles.list}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>Nothing here yet</div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  className={`${styles.row} ${s.id === activeSessionId ? styles.rowActive : ""}`}
                >
                  <Link
                    href={`/ask?session=${s.id}`}
                    className={styles.rowLink}
                    onClick={() => setOpen(false)}
                  >
                    {s.title || "Untitled"}
                  </Link>
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => onRename(s.id, s.title || "")}
                    title="Rename"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => onDelete(s.id)}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
