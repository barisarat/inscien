import { notFound } from "next/navigation"
import { getToolCategories, getToolCategory } from "../data/registry"
import ToolCategoryClient from "../components/ToolCategoryClient"

type Props = {
  params: Promise<{ category: string }>
}

export function generateStaticParams() {
  return getToolCategories().map((category) => ({
    category: category.slug,
  }))
}

export async function generateMetadata({ params }: Props) {
  const { category: slug } = await params
  const category = getToolCategory(slug)

  if (!category) {
    return {
      title: "Category not found | FinanceLab",
    }
  }

  const desc = `${category.tools.length} AI/ML tools for ${category.label.toLowerCase()}.`

  return {
    title: `${category.label} | FinanceLab AI/ML Tools`,
    description: desc,
    openGraph: {
      title: `${category.label} | FinanceLab AI/ML Tools`,
      description: desc,
      url: `https://financelab.ai/ai-ml-tools/${category.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${category.label} | FinanceLab AI/ML Tools`,
      description: desc,
    },
  }
}

export default async function ToolCategoryPage({ params }: Props) {
  const { category: slug } = await params
  const category = getToolCategory(slug)

  if (!category) notFound()

  const sidebarItems = getToolCategories().map((item) => ({
    label: item.label,
    href: `/ai-ml-tools/${item.slug}`,
  }))

  return (
    <ToolCategoryClient
      categoryLabel={category.label}
      categoryDesc={`${category.tools.length} tool${category.tools.length !== 1 ? "s" : ""} for ${category.label.toLowerCase()}.`}
      tools={category.tools}
      sidebarItems={sidebarItems}
    />
  )
}
