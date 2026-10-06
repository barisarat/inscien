"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

import { type PdfTab } from "../components/PdfViewerPanel"

interface WorkspaceValue {
  openPdf: (t: { sourceId?: string | null; title?: string; page?: number | null; passage?: string; bbox?: number[] | null }) => void
  pdfTabs: PdfTab[]
  activePdfTabId: string | null
  hasOpenPdf: boolean
  selectPdfTab: (id: string) => void
  closePdfTab: (id: string) => void
  closePdfPanel: () => void
}

const WorkspaceContext = createContext<WorkspaceValue>({
  openPdf: () => {},
  pdfTabs: [],
  activePdfTabId: null,
  hasOpenPdf: false,
  selectPdfTab: () => {},
  closePdfTab: () => {},
  closePdfPanel: () => {},
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [pdfTabs, setPdfTabs] = useState<PdfTab[]>([])
  const [activePdfTabId, setActivePdfTabId] = useState<string | null>(null)
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
        openPdf,
        pdfTabs,
        activePdfTabId,
        hasOpenPdf: pdfTabs.length > 0,
        selectPdfTab,
        closePdfTab,
        closePdfPanel,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceValue {
  return useContext(WorkspaceContext)
}
