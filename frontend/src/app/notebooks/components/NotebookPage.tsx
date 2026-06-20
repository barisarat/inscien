import fs from "fs"
import path from "path"
import { NotebookView } from "./NotebookView"
import type { NotebookEntry } from "../data"
import { notebookBasename, sidebarItemsForAllNotebooks } from "../data"

interface Props {
  entry: NotebookEntry
}

function extractBodyContent(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)

  if (match) {
    return match[1]
  }

  return html.replace(/<head[\s\S]*?<\/head>/i, "")
}

function extractHeadStyles(html: string): string {
  const blocks: string[] = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let match

  while ((match = re.exec(html)) !== null) {
    // Scope global selectors to the notebook content. Crucially this includes
    // `:root` — notebook exports redefine design tokens (`--sans`, `--accent`, …)
    // there, and since a <style> tag applies document-wide, an unscoped `:root`
    // would override the app's tokens everywhere (e.g. the sidebar wordmark font).
    const css = match[1]
      .replace(/\bbody\b/g, ".notebookInline")
      .replace(/\bhtml\b/g, ".notebookInline")
      .replace(/:root\b/g, ".notebookInline")

    blocks.push(`<style>${css}</style>`)
  }

  return blocks.join("\n")
}

function readNotebookHtml(fileBasename: string) {
  const filePath = path.join(process.cwd(), "public", "notebooks", `${fileBasename}.html`)

  try {
    const raw = fs.readFileSync(filePath, "utf8")

    return {
      bodyHtml: extractBodyContent(raw),
      headStyles: extractHeadStyles(raw),
      error: false,
    }
  } catch {
    return {
      bodyHtml: "",
      headStyles: "",
      error: true,
    }
  }
}

export function NotebookPage({ entry }: Props) {
  const basename = notebookBasename(entry.id)
  const downloadPath = `/notebooks/${basename}.ipynb`
  const sidebarItems = sidebarItemsForAllNotebooks()
  const notebookHtml = readNotebookHtml(basename)

  return (
    <NotebookView
      entry={entry}
      fileBasename={basename}
      downloadPath={downloadPath}
      sidebarItems={sidebarItems}
      bodyHtml={notebookHtml.bodyHtml}
      headStyles={notebookHtml.headStyles}
      notebookLoadError={notebookHtml.error}
    />
  )
}