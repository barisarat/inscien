import type { ListingGroup } from "@/components/listings/ListingPage"

export const podcastShows = [
  {
    id: "mlst",
    name: "Machine Learning Street Talk",
    desc: "In-depth technical interviews covering machine learning research, reasoning, and AI safety with leading researchers.",
    feedUrl: "https://anchor.fm/s/1e4a0eac/podcast/rss",
  },
  {
    id: "twiml",
    name: "TWIML AI Podcast",
    desc: "Conversations with top ML and AI researchers and practitioners on the latest trends, techniques, and real-world applications.",
    feedUrl: "https://feeds.megaphone.fm/MLN2155636147",
  },
  {
    id: "gradient-dissent",
    name: "Gradient Dissent",
    desc: "Interviews with machine learning practitioners about practical challenges in building and deploying ML systems. By Weights & Biases.",
    feedUrl: "https://feeds.captivate.fm/gradient-dissent/",
  },
  {
    id: "learning-bayesian-statistics",
    name: "Learning Bayesian Statistics",
    desc: "Exploring Bayesian inference and probabilistic programming through interviews with researchers and practitioners in the field.",
    feedUrl: "https://api.riverside.fm/hosting/iA4hgdZC.rss/",
  },
]

export const podcastGroups: ListingGroup[] = [
  {
    category: "Machine Learning & AI",
    items: podcastShows.map((s) => ({
      id: s.id,
      name: s.name,
      desc: s.desc,
      href: `/podcasts/${s.id}`,
    })),
  },
]