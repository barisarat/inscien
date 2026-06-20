import type { ReactNode } from "react"
import BackLink from "@/components/devdocs/BackLink"
import styles from "@/components/devdocs/devdocs.module.css"

export const metadata = {
  title: "Developers | FinanceLab",
}

export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.headerTop}>
          <BackLink />
        </div>
        {children}
      </div>
    </div>
  )
}
