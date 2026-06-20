"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const sources: { href: string; label: string }[] = [
  { href: "https://godbolt.org/", label: "Compiler Explorer" },
]

export default function CppSourcesPage() {
  return (
    <DirectoryDetailPage title="C++ Sources">
      <Section title="Sources">
        <ul>
          {sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.href}
              </a>{" "}
              ({s.label})
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}