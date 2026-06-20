import type { DevDocPage, DocBlock } from "@/app/developers/data/types"
import CodeBlock from "./CodeBlock"
import styles from "./devdocs.module.css"

function Block({ block }: { block: DocBlock }) {
  if (block.kind === "code") {
    return <CodeBlock code={block.code} language={block.language} />
  }

  if (block.kind === "table") {
    return (
      <table className={styles.table}>
        <thead>
          <tr>
            {block.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? styles.tableMonoCell : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className={styles.paragraphGroup}>
      {block.text?.map((p, i) => (
        <p key={i} className={styles.paragraph}>{p}</p>
      ))}
      {block.bullets && block.bullets.length > 0 && (
        <ul className={styles.bulletList}>
          {block.bullets.map((b, i) => (
            <li key={i} className={styles.bulletItem}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DocPageBody({ page }: { page: DevDocPage }) {
  return (
    <article className={styles.article}>
      {page.sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          <div className={styles.sectionBlocks}>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
  )
}
