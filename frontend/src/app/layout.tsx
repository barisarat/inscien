import type { Metadata } from "next"
import { Source_Code_Pro, Geist } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-logo",
  weight: ["600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "InScien | Private research assistant",
  description: "Ask your own research papers and get answers with page-precise, verifiable citations — local and private.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(sourceCodePro.variable, "font-sans", geist.variable)}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
