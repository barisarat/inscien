export interface InstallStep {
  label: string
  command: string
}

export interface NoteLink {
  label: string
  href: string
}

export interface NoteFact {
  label: string
  value: string
  tone?: "default" | "accent"
}

export interface NoteSection {
  title: string
  text?: string[]
  bullets?: string[]
}

export type CodeLanguage = "python" | "typescript" | "bash" | "json" | "toml"

export interface CodeUtilityDef {
  id: string
  kind: "code"
  name: string
  desc: string
  language: CodeLanguage
  install?: InstallStep[]
  code: string
}

export interface NoteUtilityDef {
  id: string
  kind: "note"
  name: string
  desc: string
  intro: string
  resources?: NoteLink[]
  facts?: NoteFact[]
  sections: NoteSection[]
}

export interface CodeNoteBlock {
  kind: "text" | "code" | "table"
  text?: string[]
  bullets?: string[]
  code?: string
  language?: CodeLanguage
  headers?: string[]
  rows?: string[][]
}

export interface CodeNoteSection {
  title: string
  blocks: CodeNoteBlock[]
}

export interface CodeNoteUtilityDef {
  id: string
  kind: "codenote"
  name: string
  desc: string
  intro: string
  sections: CodeNoteSection[]
  resources?: NoteLink[]
}

export type UtilityDef = CodeUtilityDef | NoteUtilityDef | CodeNoteUtilityDef

export function getEntryIntro(item: UtilityDef): string {
  if (item.kind === "code") return item.desc
  return item.intro
}