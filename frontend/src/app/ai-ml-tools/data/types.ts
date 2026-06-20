export type AiTool = {
  id: string
  name: string
  url: string
  oneLine: string
  role: string
  // Intuitive sub-grouping within a category (by purpose/use-case), e.g. "Embeddings",
  // "OCR & document AI" — used to render skimmable sub-sections on the detail page.
  group: string
  tags: string[]
  sourceUrl: string
}

export type ToolCategory = {
  slug: string
  label: string
  tools: AiTool[]
}
