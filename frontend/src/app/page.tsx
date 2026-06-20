import { redirect } from "next/navigation"

// InScien is a single-purpose research workbench — the chat IS the app.
export default function Home() {
  redirect("/ask")
}
