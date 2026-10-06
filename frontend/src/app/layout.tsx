import type { Metadata } from "next"
import { Source_Code_Pro, Geist } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import JobPane from "@/components/JobPane"

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-logo",
  weight: ["600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "InScien",
  description: "A map of your Zotero papers and what they cite, and narrations to listen to.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(sourceCodePro.variable, "font-sans", geist.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <JobPane />
        <Toaster />
      </body>
    </html>
  )
}
