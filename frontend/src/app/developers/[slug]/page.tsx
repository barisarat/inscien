import { notFound } from "next/navigation"
import DevDocsNav from "@/components/devdocs/DevDocsNav"
import DocPageBody from "@/components/devdocs/DocPageBody"
import styles from "@/components/devdocs/devdocs.module.css"
import { devDocPages, getDevDocPage } from "../data/registry"

export function generateStaticParams() {
  return devDocPages.map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getDevDocPage(slug)
  if (!page) return { title: "Doc not found | FinanceLab" }
  return { title: `${page.title} | FinanceLab Developers`, description: page.description }
}

export default async function DevDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getDevDocPage(slug)
  if (!page) notFound()

  return (
    <>
      <header className={styles.hero}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.subtitle}>{page.description}</p>
      </header>

      <div className={styles.docsGrid}>
        <DevDocsNav activeSlug={page.slug} />
        <DocPageBody page={page} />
      </div>
    </>
  )
}
