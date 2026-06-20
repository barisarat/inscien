export interface PodcastEpisode {
  id: string
  title: string
  date: string
  duration: string
  audioUrl: string
}

export interface PodcastDef {
  id: string
  name: string
  desc: string
  feedUrl: string
  episodes: PodcastEpisode[]
}