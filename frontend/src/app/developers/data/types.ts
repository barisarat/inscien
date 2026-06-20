export type CodeLanguage = "python" | "bash" | "json" | "typescript"

export type DocBlock =
  | { kind: "text"; text?: string[]; bullets?: string[] }
  | { kind: "code"; language: CodeLanguage; code: string }
  | { kind: "table"; headers: string[]; rows: string[][] }

export interface DocSection {
  title: string
  blocks: DocBlock[]
}

export type DevDocGroup = "Platform guide" | "API reference"

export interface DevDocPage {
  slug: string
  title: string
  navLabel: string
  group: DevDocGroup
  description: string
  sections: DocSection[]
}
