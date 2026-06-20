"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const products: string[] = [
  "https://www.travis-ci.com/",
  "https://about.codecov.io/"
]



export default function DataProductsPage() {
  return (
    <DirectoryDetailPage title="Develope Products">
      <Section title="Products">
        <ul>
          {products.map((href) => (
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