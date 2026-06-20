"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Code2,
  LineChart,
  LogIn,
  Menu,
  MoreHorizontal,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { topLevelNavItems, type SidebarNavItem } from "./sidebarSections"
import styles from "./AppSidebar.module.css"

type ContextItemAction = {
  label: string
  destructive?: boolean
  onSelect: () => void
}

type ContextItem = {
  label: string
  href: string
  action?: boolean
  actions?: ContextItemAction[]
}

type Props = {
  brandHref: string
  sectionTitle: string
  contextItems: ContextItem[]
  isOpen: boolean
  onToggle: () => void
}

const SIDEBAR_FILTER_STORAGE_PREFIX = "financelab.sidebar.contextFilter"
const SIDEBAR_OPEN_GROUPS_STORAGE_KEY = "financelab.sidebar.openGroups"

const primaryNavIcons: Record<string, LucideIcon> = {
  "New chat": Plus,
  "Signal Tests": LineChart,
  Developers: Code2,
  Settings,
  Monitor: Activity,
}

function getSidebarScopeFromPathname(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0]

  return segment || "home"
}

function getSidebarStorageKey(scope: string) {
  return `${SIDEBAR_FILTER_STORAGE_PREFIX}.${scope}`
}

function getSidebarJumpPlaceholder(sectionTitle: string) {
  const normalizedTitle = sectionTitle.trim().toLowerCase()
  const targetBySection: Record<string, string> = {
    courses: "course",
    "dev docs": "doc",
    directory: "directory item",
    docs: "doc",
    glossary: "glossary entry",
    literature: "paper",
    "linux docs": "doc",
    "ml docs": "doc",
    notebooks: "notebook",
    papers: "paper",
    podcasts: "podcast",
    search: "source",
    sources: "source",
  }

  return `Jump to ${targetBySection[normalizedTitle] || normalizedTitle}`
}

function readStoredSidebarFilter(scope: string) {
  if (typeof window === "undefined") return ""

  return window.sessionStorage.getItem(getSidebarStorageKey(scope)) || ""
}

function writeStoredSidebarFilter(scope: string, query: string) {
  if (typeof window === "undefined") return

  if (!query.trim()) {
    window.sessionStorage.removeItem(getSidebarStorageKey(scope))
    return
  }

  window.sessionStorage.setItem(getSidebarStorageKey(scope), query)
}

function readStoredSidebarOpenGroups() {
  if (typeof window === "undefined") return {}

  const rawValue = window.localStorage.getItem(SIDEBAR_OPEN_GROUPS_STORAGE_KEY)

  if (!rawValue) return {}

  try {
    const parsedValue: unknown = JSON.parse(rawValue)

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {}
    }

    return Object.entries(parsedValue).reduce<Record<string, boolean>>((result, [key, value]) => {
      if (typeof value === "boolean") {
        result[key] = value
      }

      return result
    }, {})
  } catch {
    return {}
  }
}

function writeStoredSidebarOpenGroups(openGroups: Record<string, boolean>) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(SIDEBAR_OPEN_GROUPS_STORAGE_KEY, JSON.stringify(openGroups))
}

function pathIsActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const [baseHref, queryString] = href.split("?")

  if (!queryString) {
    if (baseHref === "/") return pathname === "/"
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`)
  }

  if (pathname !== baseHref) return false

  const expectedParams = new URLSearchParams(queryString)

  for (const [key, value] of expectedParams.entries()) {
    if (searchParams.get(key) !== value) return false
  }

  return true
}

function itemIsActive(pathname: string, searchParams: URLSearchParams, item: SidebarNavItem) {
  if (item.label === "New chat" && item.href === "/ask" && searchParams.has("session")) {
    return false
  }

  if (item.href && pathIsActive(pathname, searchParams, item.href)) return true

  return (
    item.children?.some((child) => pathIsActive(pathname, searchParams, child.href)) ??
    false
  )
}

function AppSidebarInner({ brandHref, sectionTitle, contextItems, isOpen, onToggle }: Props) {
  const pathname = usePathname()
  const rawSearchParams = useSearchParams()
  const searchParamsString = rawSearchParams.toString()
  const searchParams = React.useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString]
  )
  const currentSidebarScope = React.useMemo(
    () => getSidebarScopeFromPathname(pathname),
    [pathname]
  )
  const { user, tier, login, isAuthenticated } = useAuth()
  const navItems = React.useMemo<SidebarNavItem[]>(
    () => (user?.is_admin
      ? [...topLevelNavItems, { label: "Monitor", href: "/admin" }]
      : topLevelNavItems),
    [user?.is_admin]
  )
  const [query, setQuery] = React.useState(() => readStoredSidebarFilter(currentSidebarScope))
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    () => readStoredSidebarOpenGroups()
  )
  const [openContextMenuHref, setOpenContextMenuHref] = React.useState<string | null>(null)
  const previousSidebarScopeRef = React.useRef(currentSidebarScope)

  const hasContextSection = Boolean(sectionTitle.trim()) && contextItems.length > 0

  const filteredContextItems = React.useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) return contextItems

    return contextItems.filter((item) => item.label.toLowerCase().includes(q))
  }, [contextItems, query])

  React.useEffect(() => {
    if (previousSidebarScopeRef.current === currentSidebarScope) return

    previousSidebarScopeRef.current = currentSidebarScope
    setQuery(readStoredSidebarFilter(currentSidebarScope))
  }, [currentSidebarScope])

  React.useEffect(() => {
    writeStoredSidebarFilter(currentSidebarScope, query)
  }, [currentSidebarScope, query])

  React.useEffect(() => {
    writeStoredSidebarOpenGroups(openGroups)
  }, [openGroups])

  React.useEffect(() => {
    setOpenContextMenuHref(null)
  }, [pathname, searchParamsString])

  React.useEffect(() => {
    if (!openContextMenuHref) return

    function handleDocumentClick() {
      setOpenContextMenuHref(null)
    }

    document.addEventListener("click", handleDocumentClick)

    return () => document.removeEventListener("click", handleDocumentClick)
  }, [openContextMenuHref])

  React.useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return
      if (window.innerWidth > 768) document.body.classList.remove(styles.bodyNoScroll)
    }

    window.addEventListener("resize", handleResize)

    return () => window.removeEventListener("resize", handleResize)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const isMobile = window.innerWidth <= 768

    if (isMobile && isOpen) {
      document.body.classList.add(styles.bodyNoScroll)
    } else {
      document.body.classList.remove(styles.bodyNoScroll)
    }

    return () => {
      document.body.classList.remove(styles.bodyNoScroll)
    }
  }, [isOpen])

  const initials =
    ((user?.first_name?.[0] || "") + (user?.last_name?.[0] || "")).toUpperCase() ||
    (user?.email?.[0]?.toUpperCase() || "?")

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ")
  const displayName = fullName || user?.email?.split("@")[0] || "Account"
  const tierLabel = tier === "pro" ? "Member" : "Free account"
  const sidebarJumpPlaceholder = getSidebarJumpPlaceholder(sectionTitle)

  const avatarNode = user?.picture_url ? (
    <Image
      key={user.picture_url}
      src={user.picture_url}
      alt={fullName || initials}
      width={32}
      height={32}
      className={styles.accountAvatar}
      unoptimized
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className={styles.accountAvatarFallback}>{initials}</div>
  )

  function handleGroupToggle(label: string, isCurrentlyOpen: boolean) {
    setOpenGroups((current) => ({
      ...current,
      [label]: !isCurrentlyOpen,
    }))
  }

  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  // On mobile the sidebar is a drawer; tapping a link should collapse it so the
  // page gets the full screen. No-op on desktop (the persistent rail stays put).
  function handleNavigate() {
    if (typeof window !== "undefined" && window.innerWidth <= 768 && isOpen) {
      onToggle()
    }
  }

  function renderPrimaryIcon(label: string) {
    const Icon = primaryNavIcons[label]

    if (!Icon) return null

    return (
      <span className={styles.primaryIcon} aria-hidden="true">
        <Icon size={17} strokeWidth={1.8} />
      </span>
    )
  }

  function handleContextMenuToggle(event: React.MouseEvent<HTMLButtonElement>, href: string) {
    event.preventDefault()
    event.stopPropagation()
    setOpenContextMenuHref((current) => (current === href ? null : href))
  }

  function handleContextActionSelect(
    event: React.MouseEvent<HTMLButtonElement>,
    action: ContextItemAction
  ) {
    event.preventDefault()
    event.stopPropagation()
    setOpenContextMenuHref(null)
    action.onSelect()
  }

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          className={styles.mobileMenuBtn}
          onClick={onToggle}
          aria-label="Open menu"
        >
          <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}

      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ""}`}
        onClick={onToggle}
        aria-hidden="true"
      />

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarInner}>
          <div className={styles.sidebarTop}>
            <div
              className={`${styles.toggleRow} ${
                isOpen ? styles.toggleRowOpen : styles.toggleRowClosed
              }`}
            >
              {isOpen ? (
                <Link href={brandHref} className={styles.brand}>
                  <Image
                    src="/icon.png"
                    alt=""
                    width={24}
                    height={24}
                    className={styles.brandIcon}
                    priority
                  />
                  <span className={styles.brandText}>InScien</span>
                </Link>
              ) : null}

              <button
                type="button"
                className={styles.toggleBtn}
                onClick={onToggle}
                aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <Menu size={18} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.primaryNav}>
              {navItems.map((item: SidebarNavItem) => {
                const isGroup = Boolean(item.children?.length)
                const isActive = itemIsActive(pathname, searchParams, item)
                const primaryIcon = renderPrimaryIcon(item.label)

                if (!isGroup && item.href) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleNavigate}
                      className={`${styles.primaryLink} ${
                        isActive ? styles.primaryLinkActive : ""
                      }`}
                      title={!isOpen ? item.label : undefined}
                      aria-label={!isOpen ? item.label : undefined}
                    >
                      {primaryIcon}
                      {isOpen ? <span className={styles.primaryLabel}>{item.label}</span> : null}
                    </Link>
                  )
                }

                if (!isOpen) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={`${styles.primaryLink} ${styles.navGroupButton} ${
                        isActive ? styles.primaryLinkActive : ""
                      }`}
                      title={item.label}
                      aria-label={item.label}
                      aria-expanded={false}
                      onClick={() =>
                        handleGroupToggle(item.label, openGroups[item.label] ?? isActive)
                      }
                    >
                      {primaryIcon}
                    </button>
                  )
                }

                const storedGroupState = openGroups[item.label]
                const groupIsOpen = storedGroupState ?? isActive

                return (
                  <div key={item.label} className={styles.navGroup}>
                    <button
                      type="button"
                      className={`${styles.primaryLink} ${styles.navGroupButton} ${
                        isActive ? styles.primaryLinkActive : ""
                      }`}
                      aria-expanded={groupIsOpen}
                      onClick={() => handleGroupToggle(item.label, groupIsOpen)}
                    >
                      {primaryIcon}
                      <span className={styles.primaryLabel}>{item.label}</span>
                      {groupIsOpen ? (
                        <ChevronDown
                          size={14}
                          strokeWidth={1.5}
                          className={styles.navGroupChevron}
                          aria-hidden="true"
                        />
                      ) : (
                        <ChevronRight
                          size={14}
                          strokeWidth={1.5}
                          className={styles.navGroupChevron}
                          aria-hidden="true"
                        />
                      )}
                    </button>

                    {groupIsOpen ? (
                      <div className={styles.navGroupChildren}>
                        {item.children?.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={handleNavigate}
                            className={`${styles.navChildLink} ${
                              pathIsActive(pathname, searchParams, child.href)
                                ? styles.navChildLinkActive
                                : ""
                            }`}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          </div>

          {hasContextSection && isOpen ? <div className={styles.sidebarDivider} /> : null}

          {hasContextSection && isOpen ? (
            <div className={styles.contextArea}>
              <div className={styles.contextHeader}>{sectionTitle}</div>

              <div className={styles.searchWrap}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder={sidebarJumpPlaceholder}
                  value={query}
                  onChange={handleQueryChange}
                />
              </div>

              <div className={styles.contextList}>
                {filteredContextItems.map((item) => {
                  const isActive = !item.action && pathIsActive(pathname, searchParams, item.href)
                  const hasActions = Boolean(item.actions?.length)
                  const menuIsOpen = openContextMenuHref === item.href

                  if (!hasActions) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavigate}
                        className={`${styles.contextLink} ${
                          isActive ? styles.contextLinkActive : ""
                        }`}
                      >
                        <span className={styles.contextLinkText}>{item.label}</span>
                      </Link>
                    )
                  }

                  return (
                    <div
                      key={item.href}
                      className={`${styles.contextItemRow} ${
                        menuIsOpen ? styles.contextItemRowMenuOpen : ""
                      }`}
                    >
                      <Link
                        href={item.href}
                        onClick={handleNavigate}
                        className={`${styles.contextLink} ${styles.contextLinkWithAction} ${
                          isActive ? styles.contextLinkActive : ""
                        }`}
                      >
                        <span className={styles.contextLinkText}>{item.label}</span>
                      </Link>

                      <button
                        type="button"
                        className={`${styles.contextActionButton} ${
                          menuIsOpen ? styles.contextActionButtonOpen : ""
                        }`}
                        onClick={(event) => handleContextMenuToggle(event, item.href)}
                        aria-label={`Actions for ${item.label}`}
                        aria-haspopup="menu"
                        aria-expanded={menuIsOpen}
                      >
                        <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>

                      {menuIsOpen ? (
                        <div
                          className={styles.contextActionMenu}
                          role="menu"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {item.actions?.map((action) => (
                            <button
                              key={action.label}
                              type="button"
                              role="menuitem"
                              className={`${styles.contextActionMenuItem} ${
                                action.destructive ? styles.contextActionMenuItemDanger : ""
                              }`}
                              onClick={(event) => handleContextActionSelect(event, action)}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className={styles.sidebarBottom}>
            {isAuthenticated ? (
              <div className={styles.accountActions}>
                <Link href="/settings" className={styles.accountRow}>
                  <div className={styles.accountAvatarWrap}>{avatarNode}</div>
                  <div className={`${styles.accountMeta} ${isOpen ? styles.accountMetaVisible : styles.accountMetaHidden}`}>
                    <div className={styles.accountName}>{displayName}</div>
                    <div className={styles.accountTier}>{tierLabel}</div>
                  </div>
                </Link>
              </div>
            ) : (
              <div className={styles.visitorActions}>
                <button
                  type="button"
                  className={styles.loginButton}
                  onClick={() => login(pathname || "/")}
                >
                  <LogIn className={styles.loginIcon} aria-hidden="true" size={16} />
                  <div className={`${styles.accountMeta} ${isOpen ? styles.accountMetaVisible : styles.accountMetaHidden}`}>
                    <div className={styles.loginLabel}>Sign in</div>
                  </div>
                </button>

                <div className={styles.visitorNote}>
                  Sign in to get higher limits and save progress.
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

export default function AppSidebar(props: Props) {
  return (
    <React.Suspense fallback={null}>
      <AppSidebarInner {...props} />
    </React.Suspense>
  )
}
