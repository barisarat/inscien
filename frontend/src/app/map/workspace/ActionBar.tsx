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
    <div className="flex items-center gap-1.5" role="group" aria-label="Workspace mode">
      {MODES.map(({ mode: m, label, Icon }) => (
        <Toggle
          key={m}
          size="sm"
          variant="segment"
          className="gap-1.5 !px-4"
          pressed={mode === m}
          aria-current={mode === m ? "page" : undefined}
          onPressedChange={(pressed) => {
            if (pressed) onChange(m)
          }}
        >
          <Icon className="size-3.5" />
          {label}
        </Toggle>
      ))}
    </div>
  )
}
