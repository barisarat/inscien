import { Suspense } from "react"
import { notFound } from "next/navigation"
import PodcastPlayer from "../components/PodcastPlayer"
import { podcastShows } from "../data/podcastRegistry"
import { fetchPodcastEpisodes } from "@/lib/server/podcasts"
import type { PodcastDef } from "../types"

type PageProps = {
  params: Promise<{
    podcastId: string
  }>
}

export const revalidate = 86400

export function generateStaticParams() {
  return podcastShows.map((show) => ({
    podcastId: show.id,
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const { podcastId } = await params
  const show = podcastShows.find((item) => item.id === podcastId)

  if (!show) {
    return {
      title: "Podcast not found | FinanceLab",
    }
  }

  return {
    title: `${show.name} | FinanceLab Podcasts`,
    description: show.desc,
    openGraph: {
      title: `${show.name} | FinanceLab Podcasts`,
      description: show.desc,
      url: `https://financelab.ai/podcasts/${show.id}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${show.name} | FinanceLab Podcasts`,
      description: show.desc,
    },
  }
}

export default async function PodcastDetailPage({ params }: PageProps) {
  const { podcastId } = await params
  const show = podcastShows.find((item) => item.id === podcastId)

  if (!show) notFound()

  const episodes = await fetchPodcastEpisodes(show.feedUrl)

  const podcast: PodcastDef = {
    id: show.id,
    name: show.name,
    desc: show.desc,
    feedUrl: show.feedUrl,
    episodes,
  }

  return (
    <Suspense fallback={null}>
      <PodcastPlayer podcast={podcast} />
    </Suspense>
  )
}