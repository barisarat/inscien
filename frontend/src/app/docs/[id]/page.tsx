import { getDocsEntry, utilities } from "../data/registry"
import UtilityDetail from "../components/UtilityDetail"
import { notFound } from "next/navigation"

export function generateStaticParams() {
  return utilities.map((item) => ({ id: item.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = getDocsEntry(id)

  if (!item) {
    return {
      title: "Doc not found | FinanceLab",
    }
  }

  return {
    title: `${item.name} | FinanceLab`,
    description: item.desc,
  }
}

export default async function DocsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = getDocsEntry(id)

  if (!item) notFound()

  return <UtilityDetail item={item} />
}