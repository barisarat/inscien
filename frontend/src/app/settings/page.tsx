"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import {
  getModelOptions,
  getSettings,
  updateSettings,
  type ModelOption,
} from "@/lib/api"
import styles from "./page.module.css"

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string }

export default function SettingsPage() {
  const [options, setOptions] = useState<ModelOption[]>([])
  const [displayName, setDisplayName] = useState("")
  const [selected, setSelected] = useState("")
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  useEffect(() => {
    Promise.all([getSettings(), getModelOptions()])
      .then(([s, m]) => {
        setDisplayName(s.displayName)
        setOllamaBaseUrl(s.ollamaBaseUrl)
        setOptions(m.options)

        // Map the stored local model back to a dropdown value; fall back to the first
        // available model if it isn't currently offered (e.g. it was removed from Ollama).
        const current = s.llmModel ? `local|${s.llmModel}` : ""
        setSelected(
          m.options.some((o) => o.value === current) ? current : (m.options[0]?.value ?? "")
        )
      })
      .catch((e) => setStatus({ kind: "error", message: String(e) }))
  }, [])

  async function handleSave() {
    setStatus({ kind: "saving" })
    try {
      const model = selected.includes("|") ? selected.slice(selected.indexOf("|") + 1) : selected

      await updateSettings({ displayName, llmModel: model, ollamaBaseUrl })
      setStatus({ kind: "saved" })
    } catch (e) {
      setStatus({ kind: "error", message: String(e) })
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/ask" className={styles.back}>
          <ArrowLeft size={16} strokeWidth={1.5} /> Back to chat
        </Link>

        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>
          InScien runs entirely on a local model — your papers and questions never leave this
          machine. These settings are stored locally.
        </p>

        <section className={styles.group}>
          <label className={styles.label} htmlFor="displayName">Your name</label>
          <input
            id="displayName"
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Aratbaris"
          />
        </section>

        <section className={styles.group}>
          <label className={styles.label} htmlFor="model">Local model</label>
          <select
            id="model"
            className={styles.input}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {options.length === 0 ? (
              <option value="">No local models found — is Ollama running?</option>
            ) : (
              options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))
            )}
          </select>
          <p className={styles.hint}>
            Models are read from your running Ollama. A larger model gives better drafts;
            it’s your quality dial — and every model runs fully local and free. Pull a new
            model, restart Ollama, then reopen this page to see it here.
          </p>
        </section>

        <section className={styles.group}>
          <label className={styles.label} htmlFor="ollama">Ollama URL</label>
          <input
            id="ollama"
            className={styles.input}
            value={ollamaBaseUrl}
            onChange={(e) => setOllamaBaseUrl(e.target.value)}
            placeholder="http://host.docker.internal:11434/v1"
          />
        </section>

        <div className={styles.actions}>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={status.kind === "saving"}
          >
            {status.kind === "saving" ? "Saving…" : "Save settings"}
          </button>
          {status.kind === "saved" ? <span className={styles.savedNote}>Saved</span> : null}
          {status.kind === "error" ? <span className={styles.errorNote}>{status.message}</span> : null}
        </div>
      </div>
    </main>
  )
}
