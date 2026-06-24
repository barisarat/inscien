"use client"

import { AudioLines, Network } from "lucide-react"

import { Toggle } from "@/components/ui/toggle"

// InScien is two transformation modes: Map (the default) and Narrate.
export type WorkspaceMode = "narrate" | "graph"

const MODES: { mode: WorkspaceMode; label: string; Icon: typeof Network }[] = [
  { mode: "graph", label: "Map", Icon: Network },
  { mode: "narrate", label: "Narrate", Icon: AudioLines },
]

type Props = {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}

export default function ActionBar({ mode, onChange }: Props) {
  return (
    <nav className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 shadow-xs" aria-label="Workspace mode">
      {MODES.map(({ mode: m, label, Icon }) => (
        <Toggle
          key={m}
          size="sm"
          pressed={mode === m}
          className="border border-transparent data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:shadow-xs"
          aria-current={mode === m ? "page" : undefined}
          onPressedChange={(pressed) => {
            if (pressed) onChange(m)
          }}
        >
          <Icon size={15} />
          {label}
        </Toggle>
      ))}
    </nav>
  )
}
