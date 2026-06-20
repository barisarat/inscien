"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const sources: { href: string; label: string }[] = [
  { href: "https://oatd.org/", label: "Open Access Theses and Dissertations" },
  { href: "https://www.oreilly.com/", label: "O'Reilly" },
]

export default function ReadingResearchPage() {
  return (
    <DirectoryDetailPage title="Reading / Research">
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