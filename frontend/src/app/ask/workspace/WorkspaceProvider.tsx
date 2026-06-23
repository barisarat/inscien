"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

import { saveChatTurn, type CompareResult, type VerifyResult } from "@/lib/api"
import { type PdfTab } from "../components/PdfViewerPanel"
import { type WorkspaceMode } from "./ActionBar"

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
  | { kind: "verify"; sessionId: number | null; result: VerifyResult }
  | null

interface WorkspaceValue {
  mode: WorkspaceMode
  setMode: (m: WorkspaceMode) => void
  openPdf: (t: { sourceId?: string | null; title?: string; page?: number | null; passage?: string; bbox?: number[] | null }) => void
  pdfTabs: PdfTab[]
  activePdfTabId: string | null
  hasOpenPdf: boolean
  selectPdfTab: (id: string) => void
  closePdfTab: (id: string) => void
  closePdfPanel: () => void
  // Persist a finished run to History (a typed ChatSession). Returns its session id.
  saveRun: (kind: "comparison" | "writeup" | "verify", title: string, widget: Record<string, unknown>) => Promise<number | null>
  activeArtifact: ActiveArtifact
  setActiveArtifact: (a: ActiveArtifact) => void
}

const WorkspaceContext = createContext<WorkspaceValue>({
  mode: "ask",
  setMode: () => {},
  openPdf: () => {},
  pdfTabs: [],
  activePdfTabId: null,
  hasOpenPdf: false,
  selectPdfTab: () => {},
  closePdfTab: () => {},
  closePdfPanel: () => {},
  saveRun: async () => null,
  activeArtifact: null,
  setActiveArtifact: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<WorkspaceMode>("ask")
  const [pdfTabs, setPdfTabs] = useState<PdfTab[]>([])
  const [activePdfTabId, setActivePdfTabId] = useState<string | null>(null)
  const [activeArtifact, setActiveArtifact] = useState<ActiveArtifact>(null)

  // Switching mode via the action bar starts fresh — drop any loaded run. (loadRun
  // sets the artifact *after* calling setMode, so reloads still win.)
  const setMode = useCallback((m: WorkspaceMode) => {
    setModeRaw(m)
    setActiveArtifact(null)
  }, [])

  const openPdf = useCallback(
    (t: { sourceId?: string | null; title?: string; page?: number | null; passage?: string; bbox?: number[] | null }) => {
      if (!t.sourceId) return
      const id = t.sourceId
      const tab: PdfTab = {
        id,
        title: t.title || "Source",
        sourceId: id,
        targetPage: t.page ?? 1,
        passage: t.passage,
        bbox: t.bbox ?? null,
      }
      setPdfTabs((prev) =>
        prev.some((existing) => existing.id === id)
          ? prev.map((existing) => (existing.id === id ? tab : existing))
          : [...prev, tab]
      )
      setActivePdfTabId(id)
    },
    [],
  )

  const selectPdfTab = useCallback((id: string) => {
    setActivePdfTabId(id)
  }, [])

  const closePdfTab = useCallback((id: string) => {
    setPdfTabs((prev) => prev.filter((tab) => tab.id !== id))
    setActivePdfTabId((current) => (current === id ? null : current))
  }, [])

  const closePdfPanel = useCallback(() => {
    setPdfTabs([])
    setActivePdfTabId(null)
  }, [])

  const saveRun = useCallback(
    async (kind: "comparison" | "writeup" | "verify", title: string, widget: Record<string, unknown>) => {
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
      value={{
        mode,
        setMode,
        openPdf,
        pdfTabs,
        activePdfTabId,
        hasOpenPdf: pdfTabs.length > 0,
        selectPdfTab,
        closePdfTab,
        closePdfPanel,
        saveRun,
        activeArtifact,
        setActiveArtifact,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceValue {
  return useContext(WorkspaceContext)
}
