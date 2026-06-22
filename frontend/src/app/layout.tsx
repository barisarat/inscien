import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Source_Code_Pro } from "next/font/google"
import { SidebarProvider } from "@/lib/SidebarProvider"
import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

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
    <html lang="en" className={`${plusJakartaSans.variable} ${sourceCodePro.variable}`}>
      <body>
        <SidebarProvider>
          {children}
        </SidebarProvider>
      </body>
    </html>
  )
}
