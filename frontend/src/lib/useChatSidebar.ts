"use client"

import { useCallback, useEffect, useState } from "react"
import { type ChatSessionSummary, listChatSessions } from "@/lib/api"
import { useAuth } from "@/lib/auth"

export type ContextItemAction = {
  label: string
  destructive?: boolean
  onSelect: () => void
}

export type ContextItem = {
  label: string
  href: string
  action?: boolean
  actions?: ContextItemAction[]
}

// Session titles come from the first user message, so they often start lowercase;
// capitalize the first letter for a consistent sidebar.
function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Build the chat-history sidebar items (shared so the left rail is identical on
// every page — Chat, Signal Tests, …). Logged-out users get no list. Starting a new
// chat lives in the top nav ("New chat" → /ask), so the history block is purely the
// list of saved sessions.
export function buildChatContextItems(
  sessions: ChatSessionSummary[],
  isAuthenticated: boolean
): ContextItem[] {
  if (!isAuthenticated) return []
  return sessions.map((s) => ({
    label: capitalizeFirst(s.title || "Untitled chat"),
    href: `/ask?session=${s.id}`,
  }))
}

// Self-contained chat-session list for pages other than the chat itself (e.g. the
// Signal Tests dashboard) so the sidebar stays consistent across nav.
export function useChatSidebar() {
  const { isAuthenticated } = useAuth()
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setSessions([])
      return
    }
    try {
      const { sessions } = await listChatSessions()
      setSessions(sessions)
    } catch {
      // ignore
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { sessions, contextItems: buildChatContextItems(sessions, isAuthenticated), refresh }
}
