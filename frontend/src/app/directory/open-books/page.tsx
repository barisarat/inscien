"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const sources: { href: string; label: string }[] = [
  { href: "http://neuralnetworksanddeeplearning.com/chap4.html", label: "Deep Learning" },
]

export default function OpenBooksPage() {
  return (
    <DirectoryDetailPage title="Open Book Sources">
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