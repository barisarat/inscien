import "server-only"

import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { PodcastEpisode } from "@/app/podcasts/types"

function parseDuration(raw: string | undefined): string {
  if (!raw) return ""

  if (raw.includes(":")) return raw

  const totalSec = parseInt(raw, 10)

  if (isNaN(totalSec)) return raw

  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return `${m}:${String(s).padStart(2, "0")}`
}

function parseDate(raw: string): string {
  try {
    const d = new Date(raw)

    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return raw
  }
}

function cleanXmlText(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

function fetchFeedXml(feedUrl: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Podcast feed redirected too many times"))
      return
    }

    const url = new URL(feedUrl)
    const requestFn = url.protocol === "http:" ? httpRequest : httpsRequest

    const req = requestFn(
      url,
      {
        headers: {
          "User-Agent": "FinanceLab/1.0",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0

        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString()
          res.resume()
          fetchFeedXml(nextUrl, redirectCount + 1).then(resolve).catch(reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume()
          reject(new Error(`Podcast feed error: ${statusCode}`))
          return
        }

        const chunks: Buffer[] = []

        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
        })

        res.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"))
        })
      }
    )

    req.on("error", reject)

    req.setTimeout(20000, () => {
      req.destroy(new Error("Podcast feed request timed out"))
    })

    req.end()
  })
}

export async function fetchPodcastEpisodes(feedUrl: string, limit = 50): Promise<PodcastEpisode[]> {
  const xml = await fetchFeedXml(feedUrl)
  const episodes: PodcastEpisode[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null
  let index = 0

  while ((match = itemRegex.exec(xml)) !== null && index < limit) {
    const block = match[1]

    const title =
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""

    const pubDate =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""

    const duration =
      block.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/)?.[1]

    const audioUrl =
      block.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ??
      block.match(/<enclosure[^>]+url='([^']+)'/)?.[1] ??
      ""

    if (!audioUrl) continue

    episodes.push({
      id: `ep-${index}`,
      title: cleanXmlText(title),
      date: parseDate(cleanXmlText(pubDate)),
      duration: parseDuration(duration ? cleanXmlText(duration) : undefined),
      audioUrl: cleanXmlText(audioUrl),
    })

    index++
  }

  return episodes
}