"use client"

import { type Ref, useCallback, useEffect, useImperativeHandle, useRef } from "react"
import styles from "./NotebookPage.module.css"

export interface NotebookInlineHandle {
  setAllCollapsed: (collapsed: boolean) => void
}

interface Props {
  bodyHtml: string
  headStyles: string
  notebookLoadError: boolean
  ref?: Ref<NotebookInlineHandle>
}

const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4" />' +
  '<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />' +
  "</svg>"

const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M3 8l3.5 3.5L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />' +
  "</svg>"

function syncToggleAria(button: HTMLElement, collapsed: boolean, index: number) {
  button.setAttribute("aria-expanded", collapsed ? "false" : "true")
  button.setAttribute(
    "aria-label",
    collapsed ? `Show code input ${index + 1}` : `Hide code input ${index + 1}`
  )
}

function extractCellSource(cell: HTMLElement): string {
  const pre = cell.querySelector<HTMLElement>(".jp-InputArea-editor .highlight pre")
  if (pre) return pre.innerText.replace(/\n+$/, "")

  const editor = cell.querySelector<HTMLElement>(".jp-InputArea-editor")
  return editor ? editor.innerText.replace(/\n+$/, "") : ""
}

// Height of the fixed AppTopHeader; the anchor cell is the topmost one below it.
const HEADER_OFFSET = 52

/**
 * Run `mutate` (which changes cell heights) while keeping the reading position fixed:
 * record an anchor cell's distance from the viewport top, apply the change, then scroll
 * by the delta so that cell stays put. Reading getBoundingClientRect() after mutate()
 * forces a synchronous reflow, so the post-change measurement is accurate.
 */
function withScrollAnchor(
  root: HTMLElement,
  mutate: () => void,
  anchor?: HTMLElement | null
) {
  const anchorEl =
    anchor ??
    Array.from(root.querySelectorAll<HTMLElement>(".jp-Cell")).find(
      (cell) => cell.getBoundingClientRect().bottom > HEADER_OFFSET + 1
    )

  const before = anchorEl?.getBoundingClientRect().top

  mutate()

  if (anchorEl && before != null) {
    window.scrollBy(0, anchorEl.getBoundingClientRect().top - before)
  }
}

export function NotebookInline({
  bodyHtml,
  headStyles,
  notebookLoadError,
  ref,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current

    if (!root) return

    const cells = Array.from(root.querySelectorAll<HTMLElement>(".jp-CodeCell"))

    cells.forEach((cell, index) => {
      const inputWrapper = cell.querySelector<HTMLElement>(".jp-Cell-inputWrapper")

      if (!inputWrapper) return

      if (!cell.querySelector(".mlnCodeInputToggle")) {
        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.className = "mlnCodeInputToggle"
        toggle.textContent = `[${index + 1}]`

        toggle.addEventListener("click", () => {
          withScrollAnchor(
            root,
            () => {
              const collapsed = cell.classList.toggle("mlnCodeInputCollapsed")
              syncToggleAria(toggle, collapsed, index)
            },
            cell
          )
        })

        cell.insertBefore(toggle, inputWrapper)
      }

      if (!inputWrapper.querySelector(".mlnCodeCopyBtn")) {
        const copyBtn = document.createElement("button")
        copyBtn.type = "button"
        copyBtn.className = "mlnCodeCopyBtn"
        copyBtn.setAttribute("aria-label", `Copy code from cell ${index + 1}`)
        copyBtn.innerHTML = COPY_ICON

        copyBtn.addEventListener("click", () => {
          const source = extractCellSource(cell)
          if (!source) return

          navigator.clipboard
            .writeText(source)
            .then(() => {
              copyBtn.innerHTML = CHECK_ICON
              copyBtn.classList.add("mlnCodeCopyBtnDone")
              window.setTimeout(() => {
                copyBtn.innerHTML = COPY_ICON
                copyBtn.classList.remove("mlnCodeCopyBtnDone")
              }, 1600)
            })
            .catch(() => {})
        })

        inputWrapper.appendChild(copyBtn)
      }

      // Default reader view: code hidden, markdown + outputs shown.
      cell.classList.add("mlnCodeInputCollapsed")
      const toggle = cell.querySelector<HTMLElement>(".mlnCodeInputToggle")
      if (toggle) syncToggleAria(toggle, true, index)
    })
  }, [bodyHtml])

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    const root = rootRef.current

    if (!root) return

    const cells = Array.from(root.querySelectorAll<HTMLElement>(".jp-CodeCell"))

    withScrollAnchor(root, () => {
      cells.forEach((cell, index) => {
        cell.classList.toggle("mlnCodeInputCollapsed", collapsed)
        const toggle = cell.querySelector<HTMLElement>(".mlnCodeInputToggle")
        if (toggle) syncToggleAria(toggle, collapsed, index)
      })
    })
  }, [])

  useImperativeHandle(ref, () => ({ setAllCollapsed }), [setAllCollapsed])

  if (notebookLoadError) {
    return (
      <p className={styles.notebookPlaceholderText}>
        Could not load notebook. Try downloading the .ipynb file above.
      </p>
    )
  }

  return (
    <div ref={rootRef} className={styles.notebookInline}>
      {headStyles && <div dangerouslySetInnerHTML={{ __html: headStyles }} />}
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  )
}
