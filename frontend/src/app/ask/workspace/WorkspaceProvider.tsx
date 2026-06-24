"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

import { type PdfTab } from "../components/PdfViewerPanel"
import { type WorkspaceMode } from "./ActionBar"

// A finished narration handed to NarrateMode to play directly.
export type ActiveArtifact =
  | { kind: "narration"; docId: string; jobId: string; title: string }
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
  activeArtifact: ActiveArtifact
  setActiveArtifact: (a: ActiveArtifact) => void
}

const WorkspaceContext = createContext<WorkspaceValue>({
  mode: "graph",
  setMode: () => {},
  openPdf: () => {},
  pdfTabs: [],
  activePdfTabId: null,
  hasOpenPdf: false,
  selectPdfTab: () => {},
  closePdfTab: () => {},
  closePdfPanel: () => {},
  activeArtifact: null,
  setActiveArtifact: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeRaw] = useState<WorkspaceMode>("graph")
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
