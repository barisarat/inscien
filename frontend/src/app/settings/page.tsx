"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import {
  getModelOptions,
  getSettings,
  updateSettings,
  type ModelOption,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string }

const PAGE_GUTTER = {
  paddingLeft: "clamp(1.5rem, 4vw, 3.5rem)",
  paddingRight: "clamp(1.5rem, 4vw, 3.5rem)",
  paddingTop: "4rem",
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="border-t" style={{ marginTop: "2.25rem", paddingTop: "2rem", paddingBottom: "1rem" }}>
      <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
        <div className="flex max-w-2xl flex-col gap-6">{children}</div>
      </div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  help,
  children,
}: {
  label: string
  htmlFor?: string
  help?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help ? <p className="text-xs leading-5 text-muted-foreground">{help}</p> : null}
    </div>
  )
}

export default function SettingsPage() {
  const [options, setOptions] = useState<ModelOption[]>([])
  const [provider, setProvider] = useState("local")
  const [selected, setSelected] = useState("")
  const [cloudModel, setCloudModel] = useState("")
  const [cloudModelHint, setCloudModelHint] = useState("")
  const [openAiKeyPresent, setOpenAiKeyPresent] = useState(false)
  const [openAiKey, setOpenAiKey] = useState("")
  const [zoteroDataDir, setZoteroDataDir] = useState("")
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("")
  const [ollamaReachable, setOllamaReachable] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  useEffect(() => {
    Promise.all([getSettings(), getModelOptions()])
      .then(([s, m]) => {
        setProvider(s.llmProvider || "local")
        setOllamaBaseUrl(s.ollamaBaseUrl)
        setZoteroDataDir(s.zoteroDataDir)
        setOptions(m.options)
        setOllamaReachable(m.ollamaReachable)
        setCloudModelHint(m.cloudModelHint ?? "")
        setOpenAiKeyPresent(s.openAiApiKeyPresent)
        if (s.llmProvider === "openai") setCloudModel(s.llmModel)
        const current = s.llmProvider !== "openai" && s.llmModel ? `local|${s.llmModel}` : ""
        setSelected(m.options.some((o) => o.value === current) ? current : (m.options[0]?.value ?? ""))
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
      // Send the key only when the user typed one - a blank field leaves the stored key intact.
      const key = openAiKey.trim()
      await updateSettings({
        llmProvider: provider,
        llmModel: model,
        ollamaBaseUrl,
        zoteroDataDir,
        ...(key ? { openAiApiKey: key } : {}),
      })
      if (key) {
        setOpenAiKeyPresent(true)
        setOpenAiKey("")
      }
      setStatus({ kind: "saved" })
    } catch (e) {
      setStatus({ kind: "error", message: String(e) })
    }
  }

  return (
    <main className="min-h-svh bg-background pb-10" style={PAGE_GUTTER}>
      <div className="mx-auto flex max-w-[57rem] flex-col">
        <Link href="/map" className="inline-flex w-fit items-center gap-2 text-sm font-medium">
          <ArrowLeft className="size-4" /> Back to Map
        </Link>

        <div className="max-w-3xl" style={{ marginTop: "1.25rem", marginBottom: "1.75rem" }}>
          <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            InScien maps your library fully locally. Narration uses a model you choose: local
            Ollama for privacy, or OpenAI for higher-quality cloud narration.
          </p>
        </div>

        <SettingsSection title="Library" description="The Zotero data folder InScien reads read-only.">
          <Field
            label="Zotero data folder"
            htmlFor="zoteroDir"
            help={
              <>
                The folder containing <code>zotero.sqlite</code> and <code>storage/</code>. InScien
                reads it through a private snapshot and never modifies it. After changing this,
                re-index your collections.
              </>
            }
          >
            <Input
              id="zoteroDir"
              className="!px-4"
              value={zoteroDataDir}
              onChange={(e) => setZoteroDataDir(e.target.value)}
              placeholder="e.g. /home/you/Zotero  or  C:\Users\you\Zotero"
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="Model" description="Choose the model used for narration generation.">
          <Field label="Provider">
            <Select value={provider} onValueChange={(v) => setProvider(v ?? "")}>
              <SelectTrigger className="w-full !px-4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local (Ollama) - private, free</SelectItem>
                <SelectItem value="openai">OpenAI - cloud, higher quality</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {provider === "local" ? (
            <>
              <Field
                label="Local model"
                help="Models are read from your running Ollama. Larger models usually produce better narration."
              >
                <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
                  <SelectTrigger className="w-full !px-4">
                    <SelectValue
                      placeholder={
                        ollamaReachable
                          ? "Ollama has no models - pull one first"
                          : "Ollama isn't reachable - start it and refresh"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ollama URL" htmlFor="ollama">
                <Input
                  id="ollama"
                  className="!px-4"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Cloud model" htmlFor="cloudModel">
                <Input
                  id="cloudModel"
                  className="!px-4"
                  value={cloudModel}
                  onChange={(e) => setCloudModel(e.target.value)}
                  placeholder={cloudModelHint || "gpt-5.4-nano"}
                />
              </Field>
              <Field
                label="OpenAI API key"
                htmlFor="openAiKey"
                help={
                  <span className={openAiKeyPresent ? "text-muted-foreground" : "text-destructive"}>
                    {openAiKeyPresent
                      ? "A key is saved. It's stored only on this machine and never shown again; type a new one to replace it."
                      : "No key set. Paste your OpenAI API key here and save. It's stored only on this machine."}
                  </span>
                }
              >
                <Input
                  id="openAiKey"
                  className="!px-4"
                  type="password"
                  autoComplete="off"
                  value={openAiKey}
                  onChange={(e) => setOpenAiKey(e.target.value)}
                  placeholder={openAiKeyPresent ? "Saved - type a new key to replace it" : "sk-..."}
                />
              </Field>
            </>
          )}
        </SettingsSection>

        <div
          className="grid border-t md:grid-cols-[13rem_minmax(0,1fr)]"
          style={{ marginTop: "2.25rem", paddingTop: "2rem" }}
        >
          <div />
          <div className="flex max-w-2xl items-center justify-end gap-3">
            <Button className="gap-2 !px-8" onClick={handleSave} disabled={status.kind === "saving"}>
              {status.kind === "saving" ? "Saving..." : "Save settings"}
            </Button>
            {status.kind === "saved" ? <span className="text-sm text-muted-foreground">Saved</span> : null}
            {status.kind === "error" ? <span className="text-sm text-destructive">{status.message}</span> : null}
          </div>
        </div>
      </div>
    </main>
  )
}
