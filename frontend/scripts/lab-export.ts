import fs from "fs/promises"
import path from "path"
import * as cheerio from "cheerio"
import type { Element } from "domhandler"

import { docsEntries, glossaryEntries, DOCS_CATEGORY } from "../src/app/docs/data/registry"
import { notebooks, notebookBasename } from "../src/app/notebooks/data"
import { literatureTopics } from "../src/app/papers/data/literatureData"
import { podcastShows, podcastGroups } from "../src/app/podcasts/data/podcastRegistry"
import { getToolCategories } from "../src/app/ai-ml-tools/data/registry"

type LabContentMode =
  | "full_text"
  | "full_text_or_rendered_output"
  | "metadata_only"

type LabSourceType =
  | "doc"
  | "notebook"
  | "paper_topic"
  | "paper"
  | "course"
  | "course_lecture"
  | "podcast"
  | "podcast_episode"
  | "glossary"
  | "ai_tool"

type LabMetadataValue = string | number | boolean | string[]

type LabChunk = {
  sourceType: LabSourceType
  sourceId: string
  chunkId: string
  parentId?: string
  title: string
  description?: string
  category?: string
  sectionTitle?: string
  url: string
  externalUrl?: string
  contentMode: LabContentMode
  text: string
  metadata: Record<string, LabMetadataValue>
}

type UtilityResource = {
  label: string
  href: string
}

type UtilityInstallStep = {
  label: string
  command: string
}

type UtilityBlock = {
  kind?: string
  text?: string | string[]
  bullets?: string[]
  language?: string
  code?: string
  headers?: string[]
  rows?: string[][]
}

type UtilitySection = {
  title: string
  text?: string[]
  bullets?: string[]
  blocks?: UtilityBlock[]
}

type UtilityEntry = {
  id: string
  kind: string
  name: string
  desc: string
  intro?: string
  language?: string
  install?: UtilityInstallStep[]
  code?: string
  resources?: UtilityResource[]
  sections?: UtilitySection[]
}

const ROOT_DIR = process.cwd()
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "lab-index")
const NOTEBOOKS_DIR = path.join(ROOT_DIR, "public", "notebooks")

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeText(value: string | string[] | undefined): string {
  if (!value) return ""

  if (Array.isArray(value)) {
    return value.join("\n")
  }

  return value
}

function flattenDocBlock(block: UtilityBlock): string {
  const parts: string[] = []
  const text = normalizeText(block.text)

  if (text) {
    parts.push(text)
  }

  if (Array.isArray(block.bullets) && block.bullets.length > 0) {
    parts.push(block.bullets.map((bullet) => `- ${bullet}`).join("\n"))
  }

  if (Array.isArray(block.headers) && Array.isArray(block.rows)) {
    const tableLines = [
      block.headers.join(" | "),
      ...block.rows.map((row) => row.join(" | ")),
    ]

    parts.push(`Table:\n${tableLines.join("\n")}`)
  }

  if (block.code) {
    const language = block.language ? block.language : "text"
    parts.push(`Code (${language}):\n${block.code}`)
  }

  return cleanText(parts.join("\n\n"))
}

function flattenUtilitySection(section: UtilitySection): string {
  const parts: string[] = []

  if (Array.isArray(section.blocks) && section.blocks.length > 0) {
    const blockText = section.blocks
      .map(flattenDocBlock)
      .filter(Boolean)
      .join("\n\n")

    if (blockText) {
      parts.push(blockText)
    }
  }

  if (Array.isArray(section.text) && section.text.length > 0) {
    parts.push(section.text.join("\n\n"))
  }

  if (Array.isArray(section.bullets) && section.bullets.length > 0) {
    parts.push(section.bullets.map((bullet) => `- ${bullet}`).join("\n"))
  }

  return cleanText(parts.join("\n\n"))
}

function buildCodeUtilityText(entry: UtilityEntry): string {
  const parts: string[] = []

  if (Array.isArray(entry.install) && entry.install.length > 0) {
    parts.push(
      [
        "Installation:",
        ...entry.install.map((step) => `${step.label}: ${step.command}`),
      ].join("\n")
    )
  }

  if (entry.code) {
    const language = entry.language ? entry.language : "text"
    parts.push(`Code (${language}):\n${entry.code}`)
  }

  return cleanText(parts.join("\n\n"))
}

function buildUtilityChunks(
  entries: UtilityEntry[],
  sourceType: "doc" | "glossary",
  fallbackCategory: string,
  sourceLabel: string
): LabChunk[] {
  const chunks: LabChunk[] = []

  for (const entry of entries) {
    const category = DOCS_CATEGORY[entry.id] || fallbackCategory
    const resources = entry.resources || []
    const usedChunkIds = new Set<string>()

    if (entry.kind === "code") {
      const codeText = buildCodeUtilityText(entry)

      if (!codeText) continue

      const text = cleanText([
        `Source type: ${sourceLabel}`,
        `Title: ${entry.name}`,
        `Category: ${category}`,
        `Description: ${entry.desc}`,
        codeText,
        resources.length > 0
          ? `Resources:\n${resources.map((resource) => `- ${resource.label}: ${resource.href}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n"))

      chunks.push({
        sourceType,
        sourceId: entry.id,
        chunkId: `${sourceType}::${entry.id}::code`,
        title: entry.name,
        description: entry.desc,
        category,
        sectionTitle: "Code",
        url: `/docs/${entry.id}`,
        contentMode: "full_text",
        text,
        metadata: {
          kind: entry.kind,
          resources: resources.map((resource) => `${resource.label}: ${resource.href}`),
        },
      })

      continue
    }

    for (const section of entry.sections || []) {
      const sectionText = flattenUtilitySection(section)

      if (!sectionText) continue

      const baseSectionSlug = slugify(section.title) || "section"
      let sectionSlug = baseSectionSlug
      let duplicateIndex = 2
      let chunkId = `${sourceType}::${entry.id}::${sectionSlug}`

      while (usedChunkIds.has(chunkId)) {
        sectionSlug = `${baseSectionSlug}-${duplicateIndex}`
        chunkId = `${sourceType}::${entry.id}::${sectionSlug}`
        duplicateIndex += 1
      }

      usedChunkIds.add(chunkId)

      const text = cleanText([
        `Source type: ${sourceLabel}`,
        `Title: ${entry.name}`,
        `Category: ${category}`,
        `Description: ${entry.desc}`,
        entry.intro ? `Intro: ${entry.intro}` : "",
        `Section: ${section.title}`,
        sectionText,
        resources.length > 0
          ? `Resources:\n${resources.map((resource) => `- ${resource.label}: ${resource.href}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n"))

      chunks.push({
        sourceType,
        sourceId: entry.id,
        chunkId,
        title: entry.name,
        description: entry.desc,
        category,
        sectionTitle: section.title,
        url: `/docs/${entry.id}`,
        contentMode: "full_text",
        text,
        metadata: {
          kind: entry.kind,
          resources: resources.map((resource) => `${resource.label}: ${resource.href}`),
        },
      })
    }
  }

  return chunks
}

function buildDocsChunks(): LabChunk[] {
  return buildUtilityChunks(
    docsEntries as UtilityEntry[],
    "doc",
    "Docs",
    "Doc"
  )
}

function buildGlossaryChunks(): LabChunk[] {
  return buildUtilityChunks(
    glossaryEntries as UtilityEntry[],
    "glossary",
    "Glossary",
    "Glossary"
  )
}

function extractTableText($: cheerio.CheerioAPI, tableElement: Element): string {
  const rows: string[] = []

  $(tableElement)
    .find("tr")
    .each((_, row) => {
      const cells = $(row)
        .find("th, td")
        .map((__, cell) => cleanText($(cell).text()))
        .get()
        .filter(Boolean)

      if (cells.length > 0) {
        rows.push(cells.join(" | "))
      }
    })

  return rows.join("\n")
}

function extractNotebookSections(html: string): { sectionTitle: string; text: string }[] {
  const $ = cheerio.load(html)

  $("script").remove()
  $("style").remove()
  $("img").remove()

  const sections: { sectionTitle: string; textParts: string[] }[] = []
  let currentSection: { sectionTitle: string; textParts: string[] } = {
    sectionTitle: "Notebook overview",
    textParts: [],
  }

  function flushCurrentSection() {
    const text = cleanText(currentSection.textParts.join("\n\n"))

    if (text) {
      sections.push({
        sectionTitle: currentSection.sectionTitle,
        textParts: [text],
      })
    }
  }

  $("main .jp-Cell").each((_, cell) => {
    const cellNode = $(cell)
    const markdownNode = cellNode.find(".jp-RenderedMarkdown, .jp-MarkdownOutput").first()
    const renderedTextNodes = cellNode.find(".jp-RenderedText pre")
    const tableNodes = cellNode.find(".jp-RenderedHTML table")

    if (markdownNode.length > 0) {
      const heading = cleanText(markdownNode.find("h1, h2, h3").first().text())
      const markdownText = cleanText(markdownNode.text())

      if (heading) {
        flushCurrentSection()

        currentSection = {
          sectionTitle: heading,
          textParts: [],
        }
      }

      if (markdownText) {
        currentSection.textParts.push(markdownText)
      }
    }

    renderedTextNodes.each((__, pre) => {
      const outputText = cleanText($(pre).text())

      if (outputText) {
        currentSection.textParts.push(`Rendered text output:\n${outputText}`)
      }
    })

    tableNodes.each((__, table) => {
      const tableText = cleanText(extractTableText($, table))

      if (tableText) {
        currentSection.textParts.push(`Rendered table:\n${tableText}`)
      }
    })
  })

  flushCurrentSection()

  return sections.map((section) => ({
    sectionTitle: section.sectionTitle,
    text: cleanText(section.textParts.join("\n\n")),
  }))
}

async function buildNotebookChunks(): Promise<LabChunk[]> {
  const chunks: LabChunk[] = []

  for (const notebook of notebooks) {
    const basename = notebookBasename(notebook.id)
    const htmlPath = path.join(NOTEBOOKS_DIR, `${basename}.html`)
    const url = `/notebooks/${notebook.id}`

    let sections: { sectionTitle: string; text: string }[] = []

    try {
      const html = await fs.readFile(htmlPath, "utf8")
      sections = extractNotebookSections(html)
    } catch {
      sections = []
    }

    if (sections.length === 0) {
      const text = cleanText([
        "Source type: Notebook",
        `Title: ${notebook.name}`,
        `Category: ${notebook.category}`,
        `Description: ${notebook.desc}`,
      ].join("\n"))

      chunks.push({
        sourceType: "notebook",
        sourceId: notebook.id,
        chunkId: `notebook::${notebook.id}::metadata`,
        title: notebook.name,
        description: notebook.desc,
        category: notebook.category,
        sectionTitle: "Notebook metadata",
        url,
        contentMode: "metadata_only",
        text,
        metadata: {
          htmlPath: `public/notebooks/${basename}.html`,
        },
      })

      continue
    }

    const usedNotebookChunkIds = new Set<string>()

    for (const section of sections) {
      const baseSectionSlug = slugify(section.sectionTitle) || "section"
      let sectionSlug = baseSectionSlug
      let duplicateIndex = 2
      let chunkId = `notebook::${notebook.id}::${sectionSlug}`

      while (usedNotebookChunkIds.has(chunkId)) {
        sectionSlug = `${baseSectionSlug}-${duplicateIndex}`
        chunkId = `notebook::${notebook.id}::${sectionSlug}`
        duplicateIndex += 1
      }

      usedNotebookChunkIds.add(chunkId)

      const text = cleanText([
        "Source type: Notebook",
        `Title: ${notebook.name}`,
        `Category: ${notebook.category}`,
        `Description: ${notebook.desc}`,
        `Section: ${section.sectionTitle}`,
        section.text,
      ].join("\n\n"))

      chunks.push({
        sourceType: "notebook",
        sourceId: notebook.id,
        chunkId,
        title: notebook.name,
        description: notebook.desc,
        category: notebook.category,
        sectionTitle: section.sectionTitle,
        url,
        contentMode: "full_text_or_rendered_output",
        text,
        metadata: {
          htmlPath: `public/notebooks/${basename}.html`,
        },
      })
    }
  }

  return chunks
}

function buildPaperChunks(): LabChunk[] {
  const chunks: LabChunk[] = []

  for (const topic of literatureTopics) {
    const topicText = cleanText([
      "Source type: Paper topic",
      `Topic: ${topic.label}`,
      `Category: ${topic.category}`,
      `Subtitle: ${topic.subtitle}`,
      `Description: ${topic.description}`,
      `Intro:\n${topic.intro.join("\n")}`,
      `Map intro: ${topic.mapIntro}`,
      `Papers:\n${topic.papers.map((paper) => `- ${paper.title} (${paper.year})`).join("\n")}`,
    ].join("\n\n"))

    chunks.push({
      sourceType: "paper_topic",
      sourceId: topic.id,
      chunkId: `paper_topic::${topic.id}::overview`,
      title: topic.label,
      description: topic.description,
      category: topic.category,
      sectionTitle: "Topic overview",
      url: `/papers/${topic.id}`,
      contentMode: "metadata_only",
      text: topicText,
      metadata: {
        subtitle: topic.subtitle,
        paperCount: topic.papers.length,
      },
    })

    for (const paper of topic.papers) {
      const contentMode: LabContentMode = "metadata_only"

      const paperText = cleanText([
        "Source type: Paper",
        `Paper: ${paper.title}`,
        `Topic: ${topic.label}`,
        `Topic category: ${topic.category}`,
        `Authors: ${paper.authors.join(", ")}`,
        `Year: ${paper.year}`,
        `Venue: ${paper.venue}`,
        `Type: ${paper.type}`,
        `Lane: ${paper.lane}`,
        `Citation count: ${paper.citationCount}`,
        paper.doi ? `DOI: ${paper.doi}` : "",
        `Tags: ${paper.tags.join(", ")}`,
        paper.abstract ? `Abstract metadata: ${paper.abstract}` : "",
      ].filter(Boolean).join("\n\n"))

      chunks.push({
        sourceType: "paper",
        sourceId: paper.id,
        parentId: topic.id,
        chunkId: `paper::${topic.id}::${paper.id}`,
        title: paper.title,
        description: paper.abstract,
        category: topic.category,
        sectionTitle: paper.lane,
        url: `/papers/${topic.id}`,
        externalUrl: paper.url,
        contentMode,
        text: paperText,
        metadata: {
          topicId: topic.id,
          topicLabel: topic.label,
          authors: paper.authors,
          year: paper.year,
          venue: paper.venue,
          paperType: paper.type,
          lane: paper.lane,
          citationCount: paper.citationCount,
          tags: paper.tags,
          doi: paper.doi || "",
        },
      })
    }
  }

  return chunks
}

function getPodcastCategory(showId: string): string {
  for (const group of podcastGroups) {
    const match = group.items.find((item) => item.id === showId)

    if (match) {
      return group.category
    }
  }

  return "Podcasts"
}

function buildPodcastChunks(): LabChunk[] {
  return podcastShows.map((show) => {
    const category = getPodcastCategory(show.id)

    const text = cleanText([
      "Source type: Podcast",
      `Podcast: ${show.name}`,
      `Category: ${category}`,
      `Description: ${show.desc}`,
      `RSS feed: ${show.feedUrl}`,
    ].join("\n\n"))

    return {
      sourceType: "podcast",
      sourceId: show.id,
      chunkId: `podcast::${show.id}::show-overview`,
      title: show.name,
      description: show.desc,
      category,
      sectionTitle: "Show overview",
      url: `/podcasts/${show.id}`,
      externalUrl: show.feedUrl,
      contentMode: "metadata_only",
      text,
      metadata: {
        feedUrl: show.feedUrl,
      },
    }
  })
}

function buildAiToolChunks(): LabChunk[] {
  return getToolCategories().flatMap((category) =>
    category.tools.map((tool) => {
      const text = cleanText([
        "Source type: AI/ML tool",
        `Tool: ${tool.name}`,
        `Category: ${category.label}`,
        `Group: ${tool.group}`,
        `Role: ${tool.role}`,
        `Description: ${tool.oneLine}`,
        `Tags: ${tool.tags.join(", ")}`,
        `URL: ${tool.url}`,
        `Source URL: ${tool.sourceUrl}`,
      ].join("\n\n"))

      return {
        sourceType: "ai_tool",
        sourceId: tool.id,
        parentId: category.slug,
        chunkId: `ai_tool::${category.slug}::${tool.id}`,
        title: tool.name,
        description: tool.oneLine,
        category: category.label,
        sectionTitle: tool.group,
        url: `/ai-ml-tools/${category.slug}`,
        externalUrl: tool.url,
        contentMode: "metadata_only",
        text,
        metadata: {
          categorySlug: category.slug,
          role: tool.role,
          group: tool.group,
          tags: tool.tags,
          sourceUrl: tool.sourceUrl,
        },
      }
    })
  )
}

async function writeJsonFile(filename: string, chunks: LabChunk[]) {
  const outputPath = path.join(OUTPUT_DIR, filename)
  await fs.writeFile(outputPath, `${JSON.stringify(chunks, null, 2)}\n`, "utf8")
  console.log(`${filename}: ${chunks.length} chunks`)
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const docsChunks = buildDocsChunks()
  const notebookChunks = await buildNotebookChunks()
  const paperChunks = buildPaperChunks()
  const podcastChunks = buildPodcastChunks()
  const glossaryChunks = buildGlossaryChunks()
  const aiToolChunks = buildAiToolChunks()

  await writeJsonFile("docs.json", docsChunks)
  await writeJsonFile("notebooks.json", notebookChunks)
  await writeJsonFile("papers.json", paperChunks)
  await writeJsonFile("podcasts.json", podcastChunks)
  await writeJsonFile("glossary.json", glossaryChunks)
  await writeJsonFile("ai-ml-tools.json", aiToolChunks)

  const total =
    docsChunks.length +
    notebookChunks.length +
    paperChunks.length +
    podcastChunks.length +
    glossaryChunks.length +
    aiToolChunks.length

  console.log(`total: ${total} chunks`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
