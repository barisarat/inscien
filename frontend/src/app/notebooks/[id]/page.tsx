// src/app/notebooks/[id]/page.tsx
import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { NotebookPage } from "../components/NotebookPage"
import { notebooks, getNotebook } from "../data"

export const dynamicParams = false

export function generateStaticParams() {
  return notebooks.map((n) => ({ id: n.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const entry = getNotebook(id)

  if (!entry) {
    return { title: "Notebook not found | FinanceLab" }
  }

  return { title: `${entry.name} | FinanceLab`, description: entry.desc }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entry = getNotebook(id)

  if (!entry) {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <NotebookPage entry={entry} />
    </Suspense>
  )
}