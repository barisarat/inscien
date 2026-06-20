"use client";

import { type ReactNode } from "react";
import { useAuth, type AccessLevel } from "@/lib/auth";

interface AccessGateProps {
  requires: AccessLevel;
  children: ReactNode;
  featureLabel?: string;
  silent?: boolean;
}

export function AccessGate({
  requires,
  children,
  featureLabel,
  silent = false,
}: AccessGateProps) {
  const { canAccess, login, tier, isLoading } = useAuth();

  if (isLoading) return null;
  if (canAccess(requires)) return <>{children}</>;
  if (silent) return null;

  const needsAuth = requires === "auth" && tier === "anon";
  const needsPro = requires === "pro" && (tier === "anon" || tier === "auth");
  const label = featureLabel || (needsPro ? "this feature" : "this content");

  return (
    <div style={styles.container}>
      <div style={styles.fadeOverlay} />
      <div style={styles.card}>

      {needsAuth && (
        <>
          <div style={styles.title}>Sign in to continue</div>
          <div style={styles.desc}>
            Create a free account to access {label}.
          </div>
          <button
            style={styles.primaryBtn}
            onClick={() => login(window.location.pathname)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--text-strong)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--text)")}
          >
            Continue with Google
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 6 }}>
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
        {needsPro && (
          <>
            <div style={styles.title}>Upgrade to unlock</div>
            <div style={styles.desc}>
              Access {label} and all premium features with a Pro subscription.
            </div>
            {tier === "anon" ? (
              <button
                style={styles.primaryBtn}
                onClick={() => login(window.location.pathname)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--text-strong)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--text)")}
              >
                Sign in first
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 6 }}>
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                style={styles.primaryBtn}
                onClick={() => (window.location.href = "/pricing")}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--text-strong)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--text)")}
              >
                View pricing
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 6 }}>
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </>
        )}

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 0 48px",
  },
  fadeOverlay: {
    width: "100%",
    height: 80,
    background: "linear-gradient(to bottom, transparent, var(--bg))",
    marginBottom: 0,
    pointerEvents: "none",
  },
  card: {
    maxWidth: 420,
    width: "100%",
    textAlign: "center" as const,
    padding: "40px 36px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  },
  title: {
    fontFamily: "var(--sans)",
    fontSize: "var(--title-sm)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--text)",
    marginBottom: 8,
  },
  desc: {
    fontFamily: "var(--sans)",
    fontSize: "var(--text-sm)",
    color: "var(--text-3)",
    lineHeight: 1.65,
    marginBottom: 24,
  },
  primaryBtn: {
    height: 42,
    padding: "0 24px",
    background: "var(--text)",
    color: "var(--surface)",
    border: "none",
    borderRadius: 8,
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--sans)",
    transition: "background 0.15s",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
  },
};
