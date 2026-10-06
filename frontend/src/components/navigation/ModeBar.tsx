"use client"

// The one bar every mode puts above its content (2026-09-10). Map and Listen used to draw
// their own chrome - the Map a three-row header with hardcoded inline gutters, Listen a slim
// strip - so the two never lined up and each new control had to re-derive the spacing. This
// owns the height, the gutter and the border; a mode passes only its own controls.
//
// It deliberately knows nothing about the sidebar. The Map is inside a SidebarProvider and
// passes its trigger in as a child; /listen has no sidebar at all, and a bar that called
// useSidebar could not be rendered there.
export default function ModeBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-13 shrink-0 items-center gap-3 overflow-x-auto border-b bg-background px-4">
      {children}
    </div>
  )
}
