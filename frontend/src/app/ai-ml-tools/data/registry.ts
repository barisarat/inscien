import type { ListingGroup } from "@/components/listings/ListingPage"
import type { ToolCategory } from "./types"
import models from "./categories/models"
import nlpRetrievalRag from "./categories/nlp-retrieval-rag"
import computerVision from "./categories/computer-vision"
import speech from "./categories/speech"
import mlFrameworks from "./categories/ml-frameworks"
import dataLabeling from "./categories/data-labeling"
import modelServing from "./categories/model-serving"
import orchestrationAutomation from "./categories/orchestration-automation"
import monitoringObservability from "./categories/monitoring-observability"

// Curated workflow categories in landing-page order. Tools were consolidated from the
// enriched CSV's raw workflow_role values; maintained by hand from here on.
const categories: ToolCategory[] = [
  models,
  nlpRetrievalRag,
  computerVision,
  speech,
  mlFrameworks,
  dataLabeling,
  modelServing,
  orchestrationAutomation,
  monitoringObservability,
]

export function getToolCategories(): ToolCategory[] {
  return categories
}

export function getToolCategory(slug: string): ToolCategory | undefined {
  return categories.find((category) => category.slug === slug)
}

export function getToolCount(): number {
  return categories.reduce((sum, category) => sum + category.tools.length, 0)
}

// Short scope blurb per category, shown after the tool count on the landing list
// (e.g. "57 tools in foundation, scientific, and frontier models") — mirrors the
// "N papers in {subtitle}" phrasing on the Papers page.
const CATEGORY_SCOPE: Record<string, string> = {
  models: "foundation, scientific, and frontier models",
  "nlp-retrieval-rag": "NLP, embeddings, retrieval, and RAG/agent stacks",
  "computer-vision": "image and video understanding",
  speech: "speech-to-text and audio",
  "ml-frameworks": "training frameworks, research, and ML infrastructure",
  "data-labeling": "datasets, labeling, validation, and versioning",
  "model-serving": "inference servers, runtimes, and model gateways",
  "orchestration-automation": "pipelines, orchestration, and automation",
  "monitoring-observability": "monitoring, observability, and experiment tracking",
}

// Categories grouped by where they sit in an applied ML workflow (foundations → modeling
// → run/operate), mirroring how the Dev docs split topics into logical sections.
const CATEGORY_GROUPS: { label: string; categorySlugs: string[] }[] = [
  { label: "Data & Frameworks", categorySlugs: ["data-labeling", "ml-frameworks"] },
  { label: "Modeling", categorySlugs: ["models", "nlp-retrieval-rag", "computer-vision", "speech"] },
  {
    label: "Inference & Operations",
    categorySlugs: ["model-serving", "orchestration-automation", "monitoring-observability"],
  },
]

export function getToolGroups(): ListingGroup[] {
  return CATEGORY_GROUPS.map((group) => ({
    category: group.label,
    items: group.categorySlugs
      .map((slug) => categories.find((category) => category.slug === slug))
      .filter((category): category is ToolCategory => Boolean(category))
      .map((category) => {
        const count = category.tools.length
        const scope = CATEGORY_SCOPE[category.slug]
        const base = `${count} tool${count !== 1 ? "s" : ""}`
        return {
          id: category.slug,
          name: category.label,
          desc: scope ? `${base} in ${scope}` : base,
          href: `/ai-ml-tools/${category.slug}`,
        }
      }),
  }))
}
