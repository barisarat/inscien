"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

import { saveChatTurn, type CompareResult } from "@/lib/api"
import { type WorkspaceMode } from "./ActionBar"
import PdfDrawer from "./PdfDrawer"

export type PdfTarget = { sourceId: string; title: string; page: number; passage?: string }

// A finished run loaded from History, handed to its mode to render directly.
export type ActiveArtifact =
  | {
      kind: "comparison"
      sessionId: number | null
      result: CompareResult
      papers: { docId: string; title: string }[]
      dimensions: string[]
    }
  | { kind: "writeup"; sessionId: number | null; answer: string; citations: unknown[] }
  | { kind: "narration"; docId: string; jobId: string; title: string }
  | null

interface WorkspaceValue {
  mode: WorkspaceMode
  setMode: (m: WorkspaceMode) => void
  openPdf: (t: { sourceId?: string | null; title?: string; page?: number | null; passage?: string }) => void
  closePdf: () => void
  // Persist a finished run to History (a typed ChatSession). Returns its session id.
  saveRun: (kind: "comparison" | "writeup", title: string, widget: Record<string, unknown>) => Promise<number | null>
  activeArtifact: ActiveArtifact
  setActiveArtifact: (a: ActiveArtifact) => void
}

const WorkspaceContext = createContext<WorkspaceValue>({
  mode: "ask",
  setMode: () => {},
  openPdf: () => {},
  closePdf: () => {},
  saveRun: async () => null,
  activeArtifact: null,
  setActiveArtifact: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<WorkspaceMode>("ask")
  const [pdf, setPdf] = useState<PdfTarget | null>(null)
  const [activeArtifact, setActiveArtifact] = useState<ActiveArtifact>(null)

  // Switching mode via the action bar starts fresh — drop any loaded run. (loadRun
  // sets the artifact *after* calling setMode, so reloads still win.)
  const setMode = useCallback((m: WorkspaceMode) => {
    setModeRaw(m)
    setActiveArtifact(null)
  }, [])

  const openPdf = useCallback(
    (t: { sourceId?: string | null; title?: string; page?: number | null; passage?: string }) => {
      if (!t.sourceId) return
      setPdf({ sourceId: t.sourceId, title: t.title || "Source", page: t.page ?? 1, passage: t.passage })
    },
    [],
  )
  const closePdf = useCallback(() => setPdf(null), [])

  const saveRun = useCallback(
    async (kind: "comparison" | "writeup", title: string, widget: Record<string, unknown>) => {
      try {
        const { sessionId } = await saveChatTurn({
          title,
          userContent: title,
          assistantContent: "",
          widgets: [{ kind, ...widget }],
        })
        return sessionId
      } catch {
        return null
      }
    },
    [],
  )

  return (
    <WorkspaceContext.Provider
      value={{ mode, setMode, openPdf, closePdf, saveRun, activeArtifact, setActiveArtifact }}
    >
      {children}
      {pdf ? <PdfDrawer target={pdf} onClose={closePdf} /> : null}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceValue {
  return useContext(WorkspaceContext)
}
