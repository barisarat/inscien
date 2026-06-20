import type { CodeLanguage } from "@/app/developers/data/types"
import CopyButton from "./CopyButton"
import { tokenize } from "./tokenize"
import styles from "./devdocs.module.css"

export default function CodeBlock({ code, language }: { code: string; language: CodeLanguage }) {
  const tokens = tokenize(code, language)

  return (
    <div className={styles.codeBlock}>
      <CopyButton text={code} />
      <pre className={styles.pre}>
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={styles[t.className] ?? ""}>{t.text}</span>
          ))}
        </code>
      </pre>
    </div>
  )
}
