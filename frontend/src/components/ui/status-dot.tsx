import { cn } from "@/lib/utils"

// Small filled status indicator. One shared dot so every "mapped / direct / busy"
// marker reads identically. Tones map to design tokens, never raw colors.
const TONES = {
  strong: "bg-foreground",
  muted: "bg-muted-foreground/40",
  brand: "bg-brand",
  success: "bg-[color:var(--success-text)]",
  danger: "bg-destructive",
} as const

export function StatusDot({
  tone = "strong",
  className,
  title,
}: {
  tone?: keyof typeof TONES
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TONES[tone], className)}
    />
  )
}
