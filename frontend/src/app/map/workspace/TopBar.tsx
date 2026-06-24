"use client"

import Link from "next/link"
import { Settings } from "lucide-react"

import ActionBar, { type WorkspaceMode } from "./ActionBar"
import { buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SidebarTrigger } from "@/components/ui/sidebar"

type Props = {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}

export default function TopBar({ mode, onChange }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger />
      <div className="flex flex-1 items-center justify-center">
        <ActionBar mode={mode} onChange={onChange} />
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/settings"
              aria-label="Settings"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Settings />
            </Link>
          }
        />
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
    </header>
  )
}
