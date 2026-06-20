import Link from "next/link"
import styles from "./devdocs.module.css"

export default function BackLink() {
  return (
    <Link href="/ask" className={styles.backLink}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.backArrow}>
        <path
          d="M10 12L6 8L10 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.backLabel}>FinanceLab</span>
    </Link>
  )
}
