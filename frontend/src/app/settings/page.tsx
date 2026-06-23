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
  const [provider, setProvider] = useState("local")
  const [selected, setSelected] = useState("")          // local dropdown value: "local|<model>"
  const [cloudModel, setCloudModel] = useState("")       // free-text OpenAI model id
  const [cloudModelHint, setCloudModelHint] = useState("")
  const [openAiKeyPresent, setOpenAiKeyPresent] = useState(false)
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("")
  const [ollamaReachable, setOllamaReachable] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  useEffect(() => {
    Promise.all([getSettings(), getModelOptions()])
      .then(([s, m]) => {
        setDisplayName(s.displayName)
        setProvider(s.llmProvider || "local")
        setOllamaBaseUrl(s.ollamaBaseUrl)
        setOptions(m.options)
        setOllamaReachable(m.ollamaReachable)
        setCloudModelHint(m.cloudModelHint ?? "")
        setOpenAiKeyPresent(s.openAiApiKeyPresent)

        // llmModel holds the active id for the selected provider. Seed both inputs so toggling
        // provider keeps each side's value.
        if (s.llmProvider === "openai") setCloudModel(s.llmModel)
        // Map the stored local model back to a dropdown value; fall back to the first available
        // model if it isn't currently offered (e.g. it was removed from Ollama).
        const current = s.llmProvider !== "openai" && s.llmModel ? `local|${s.llmModel}` : ""
        setSelected(
          m.options.some((o) => o.value === current) ? current : (m.options[0]?.value ?? "")
        )
      })
      .catch((e) => setStatus({ kind: "error", message: String(e) }))
  }, [])

  async function handleSave() {
    setStatus({ kind: "saving" })
    try {
      const model =
        provider === "openai"
          ? cloudModel.trim()
          : selected.includes("|") ? selected.slice(selected.indexOf("|") + 1) : selected

      await updateSettings({ displayName, llmProvider: provider, llmModel: model, ollamaBaseUrl })
      setStatus({ kind: "saved" })
    } catch (e) {
      // The backend rejects cloud-without-key / cloud-without-model with a 422 + a clear detail.
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
          InScien runs on a local model by default — your papers and questions never leave this
          machine. You can optionally switch to an OpenAI cloud model for higher quality. These
          settings are stored locally.
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
          <label className={styles.label} htmlFor="provider">Provider</label>
          <select
            id="provider"
            className={styles.input}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="local">Local (Ollama) — private, free</option>
            <option value="openai">OpenAI — cloud, higher quality</option>
          </select>
          <p className={styles.hint}>
            Applies to chat and every skill. Local keeps everything on this machine; OpenAI sends
            your retrieved passages to OpenAI for generation.
          </p>
        </section>

        {provider === "local" ? (
          <>
            <section className={styles.group}>
              <label className={styles.label} htmlFor="model">Local model</label>
              <select
                id="model"
                className={styles.input}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {options.length === 0 ? (
                  <option value="">
                    {ollamaReachable
                      ? "Ollama is running but has no models — pull one first"
                      : "Ollama isn’t reachable — start it and refresh"}
                  </option>
                ) : (
                  options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))
                )}
              </select>
              {options.length === 0 ? (
                <p className={styles.errorNote}>
                  {ollamaReachable ? (
                    <>Ollama is running but has no models. Run <code>ollama pull &lt;model&gt;</code> (e.g.{" "}
                    <code>ollama pull qwen2.5:7b</code>), then refresh.</>
                  ) : (
                    <>Couldn’t reach Ollama at <code>{ollamaBaseUrl || "the configured URL"}</code>. Start
                    Ollama on the host (see the README), then refresh this page.</>
                  )}
                </p>
              ) : null}
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
          </>
        ) : (
          <section className={styles.group}>
            <label className={styles.label} htmlFor="cloudModel">Cloud model</label>
            <input
              id="cloudModel"
              className={styles.input}
              value={cloudModel}
              onChange={(e) => setCloudModel(e.target.value)}
              placeholder={cloudModelHint || "gpt-5.4-nano"}
            />
            <p className={openAiKeyPresent ? styles.hint : styles.errorNote}>
              {openAiKeyPresent ? (
                <><code>OPENAI_API_KEY</code> detected ✓ — the key is read from the environment and
                never stored.</>
              ) : (
                <><code>OPENAI_API_KEY</code> is not set. Add it to your environment (e.g. your{" "}
                <code>.env</code>) and restart, then save here.</>
              )}
            </p>
          </section>
        )}

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
