import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Directory | FinanceLab",
  description: "Curated external tools and services grouped by topic.",
}

export default function DirectoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
