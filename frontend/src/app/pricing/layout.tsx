import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing | FinanceLab",
  description:
    "Free access to the full knowledge base, with an optional membership for higher Ask limits and a say in what gets built next.",
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
