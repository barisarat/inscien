import ListingPage from "@/components/listings/ListingPage"
import { podcastGroups } from "./data/podcastRegistry"

export const metadata = {
  title: "Podcasts | FinanceLab",
  description: "Machine learning and AI podcast episodes. Listen directly in a clean, distraction-free player.",
}

export default function PodcastsPage() {
  return (
    <ListingPage
      title="Podcasts"
      desc="Machine learning and AI podcast episodes. Listen directly in a clean, distraction-free player."
      sidebarTitle="Podcasts"
      groups={podcastGroups}
      searchPlaceholder="Filter podcasts"
    />
  )
}
