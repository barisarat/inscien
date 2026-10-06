"use client"

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

// The sidebar is offcanvas, so collapsing it takes its own trigger with it. This is the way
// back, and it is shown only while the sidebar is away - collapsed on a wide screen, or the
// phone's sheet closed after picking a paper.
export default function SidebarAwayTrigger() {
  const { state, isMobile } = useSidebar()
  if (!isMobile && state !== "collapsed") return null
  return <SidebarTrigger className="shrink-0" />
}
