import Link from "next/link"
import styles from "./page.module.css"

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.backArrow}>
      <path
        d="M10 12L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/ask" className={styles.backLink}>
            <BackIcon />
            <span className={styles.backLabel}>FinanceLab</span>
          </Link>
        </div>
        <div className={styles.headerMain}>
          <h1 className={styles.pageTitle}>Privacy Policy</h1>
          <p className={styles.lastUpdated}>Last updated: February 8, 2026</p>
        </div>
      </header>

      <main className={styles.content}>
        <p className={styles.intro}>
          This policy describes how FinanceLab collects, uses, and protects your information when you use our products and services.
        </p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Company Details</h2>
          <div className={styles.companyText}>
            <p>FINANCE LAB TEKNOLOJİ ANONİM ŞİRKETİ</p>
            <p>Address: Reşitpaşa Mah., Katar Cad., İTÜ ARI Teknokent 3 Binası No: 4, İç Kapı No: B204, Sarıyer / Istanbul, 34467</p>
            <p>Trade Registry Number: 1035621</p>
            <p>Tax Office: Sarıyer</p>
            <p>Email: info@financelab.ai</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Information We Collect</h2>
          <p>When you create an account, we collect your name, email address, and profile information provided through your authentication provider. We also collect usage data such as pages visited and features used to improve the service.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How We Use Your Information</h2>
          <p>We use your information to provide and maintain the service, manage your account and subscription, communicate service updates, and improve our products. We do not sell your personal information to third parties.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Third-Party Services</h2>
          <p>We use third-party services for authentication, payment processing (Gumroad), and infrastructure hosting. These providers may process your data in accordance with their own privacy policies.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Retention</h2>
          <p>We retain your account information for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use third-party advertising or tracking cookies.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Rights</h2>
          <p>You have the right to access, correct, or delete your personal data. You may also request a copy of your data or object to its processing. To exercise these rights, contact us at the email below.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Changes</h2>
          <p>We may update this policy from time to time. Updates become effective when published on this page.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact</h2>
          <p>For questions about this policy, contact us at <a href="mailto:info@financelab.ai" className={styles.link}>info@financelab.ai</a>.</p>
        </section>
      </main>
    </div>
  )
}