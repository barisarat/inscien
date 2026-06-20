"use client"

import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const scholar: string[] = [
  "https://scholar.google.com/citations?user=yxUduqMAAAAJ&hl=en",
  "https://scholar.google.com/citations?hl=en&user=WLN3QrAAAAAJ",
  "https://scholar.google.com/citations?user=q-buMEoAAAAJ&hl=en",
  "https://scholar.google.com/citations?user=nzEluBwAAAAJ&hl=en",
  "https://scholar.google.com/citations?user=P4nfoKYAAAAJ&hl=en",
  "https://scholar.google.com/citations?user=kukA0LcAAAAJ&hl=en",
  "https://scholar.google.com/citations?user=gLnCTgIAAAAJ&hl=en",
  "https://scholar.google.com/citations?user=bAipNH8AAAAJ&hl=en",
  "http://lecun.com/",
  "https://www.cs.toronto.edu/~hinton/",
  "https://www.norvig.com/",
  "https://people.idsia.ch/~juergen/",
  "https://bayes.cs.ucla.edu/jp_home.html",
]

export default function ScholarsPage() {
  return (
    <DirectoryDetailPage title="Scholars">
      <Section title="Samples">
        <ul>
          {scholar.map((href) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {href}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}