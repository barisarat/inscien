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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
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

export default function SettingsPage() {
  const [options, setOptions] = useState<ModelOption[]>([])
  const [displayName, setDisplayName] = useState("")
  const [provider, setProvider] = useState("local")
  const [selected, setSelected] = useState("")
  const [cloudModel, setCloudModel] = useState("")
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
      await updateSettings({ displayName, llmProvider: provider, llmModel: model, ollamaBaseUrl })
      setStatus({ kind: "saved" })
    } catch (e) {
      setStatus({ kind: "error", message: String(e) })
    }
  }

  return (
    <main className="min-h-svh bg-muted/20 px-6 py-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Link href="/ask" className={buttonVariants({ variant: "ghost", size: "sm", className: "w-fit gap-1.5" })}>
          <ArrowLeft size={16} /> Back to the Map
        </Link>

        <div className="max-w-2xl">
          <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            InScien maps your library fully locally. Narration uses a model you choose: local
            Ollama for privacy, or OpenAI for higher-quality cloud narration.
          </p>
        </div>

        <Card className="rounded-lg border bg-card py-0 shadow-sm ring-0">
          <CardHeader className="border-b bg-muted/30 p-5">
            <CardTitle>Profile</CardTitle>
            <CardDescription>Used for local personalization only.</CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="flex max-w-xl flex-col gap-2">
              <Label htmlFor="displayName">Your name</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Aratbaris" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border bg-card py-0 shadow-sm ring-0">
          <CardHeader className="border-b bg-muted/30 p-5">
            <CardTitle>Model</CardTitle>
            <CardDescription>Choose the model used for narration generation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 p-5">
            <div className="flex max-w-xl flex-col gap-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local (Ollama) — private, free</SelectItem>
                  <SelectItem value="openai">OpenAI — cloud, higher quality</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === "local" ? (
              <>
                <div className="flex max-w-xl flex-col gap-2">
                  <Label>Local model</Label>
                  <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          ollamaReachable
                            ? "Ollama has no models — pull one first"
                            : "Ollama isn’t reachable — start it and refresh"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Models are read from your running Ollama. Larger models usually produce better narration.
                  </p>
                </div>
                <div className="flex max-w-xl flex-col gap-2">
                  <Label htmlFor="ollama">Ollama URL</Label>
                  <Input id="ollama" value={ollamaBaseUrl} onChange={(e) => setOllamaBaseUrl(e.target.value)} placeholder="http://host.docker.internal:11434/v1" />
                </div>
              </>
            ) : (
              <div className="flex max-w-xl flex-col gap-2">
                <Label htmlFor="cloudModel">Cloud model</Label>
                <Input id="cloudModel" value={cloudModel} onChange={(e) => setCloudModel(e.target.value)} placeholder={cloudModelHint || "gpt-5.4-nano"} />
                <p className={`text-xs leading-5 ${openAiKeyPresent ? "text-muted-foreground" : "text-destructive"}`}>
                  {openAiKeyPresent
                    ? "OPENAI_API_KEY detected — read from the environment, never stored."
                    : "OPENAI_API_KEY is not set. Add it to your environment and restart, then save."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={status.kind === "saving"}>
            {status.kind === "saving" ? "Saving" : "Save settings"}
          </Button>
          {status.kind === "saved" ? <span className="text-sm text-muted-foreground">Saved</span> : null}
          {status.kind === "error" ? <span className="text-sm text-destructive">{status.message}</span> : null}
        </div>
      </div>
    </main>
  )
}
