"use client"

import { type ReactNode, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { getSettings, updateSettings } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  const [zoteroDataDir, setZoteroDataDir] = useState("")
  const [zoteroDetected, setZoteroDetected] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  useEffect(() => {
    getSettings()
      .then((s) => {
        setZoteroDataDir(s.zoteroDataDir || s.zoteroDataDirDetected || "")
        setZoteroDetected(s.zoteroDataDirDetected || "")
      })
      .catch((e) => setStatus({ kind: "error", message: String(e) }))
  }, [])

  async function handleSave() {
    setStatus({ kind: "saving" })
    try {
      await updateSettings({ zoteroDataDir })
      setStatus({ kind: "saved" })
    } catch (e) {
      setStatus({ kind: "error", message: String(e) })
    }
  }

  return (
    <main className="min-h-svh bg-background" style={PAGE_GUTTER}>
      <div className="flex max-w-[57rem] flex-col">
        <Link href="/map" className="inline-flex w-fit items-center gap-2 text-sm font-medium">
          <ArrowLeft className="size-4" /> Back to Map
        </Link>

        <div className="max-w-3xl" style={{ marginTop: "1.25rem", marginBottom: "1.75rem" }}>
          <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            InScien maps your library fully locally. Point it at your Zotero folder - there is
            nothing else to configure, and no model to connect.
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
            {zoteroDetected && (
              <p className="!mt-2 text-xs text-muted-foreground">
                {zoteroDataDir === zoteroDetected ? (
                  <>Auto-detected from your Zotero install.</>
                ) : (
                  <>
                    Auto-detected at <code>{zoteroDetected}</code>.{" "}
                    <button
                      type="button"
                      className="font-medium underline hover:no-underline"
                      onClick={() => setZoteroDataDir(zoteroDetected)}
                    >
                      Use this
                    </button>
                  </>
                )}
              </p>
            )}
          </Field>
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
