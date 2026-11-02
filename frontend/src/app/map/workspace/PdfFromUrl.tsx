"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

import { useWorkspace } from "./WorkspaceProvider"

// `/map/?pdf=<itemKey>&title=...` opens that Zotero item's PDF in the panel: the way another view
// (a citation card on the listen page) hands a paper to the Map in a new tab.
export default function PdfFromUrl() {
  const params = useSearchParams()
  const { openPdf } = useWorkspace()
  const pdf = params.get("pdf")
  const title = params.get("title")
  useEffect(() => {
    if (pdf) openPdf({ sourceId: pdf, title: title || undefined, page: 1 })
  }, [pdf, title, openPdf])
  return null
}
