import Link from "next/link"
import { getDevDocsNavGroups } from "@/app/developers/data/registry"
import styles from "./devdocs.module.css"

export default function DevDocsNav({ activeSlug }: { activeSlug: string }) {
  return (
    <nav className={styles.docsNav} aria-label="Developer docs">
      {getDevDocsNavGroups().map(({ group, items }) => (
        <div key={group} className={styles.docsNavGroup}>
          {items.map((item) => (
            <Link
              key={item.slug}
              href={`/developers/${item.slug}`}
              className={`${styles.docsNavLink} ${item.slug === activeSlug ? styles.docsNavLinkActive : ""}`}
              aria-current={item.slug === activeSlug ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
