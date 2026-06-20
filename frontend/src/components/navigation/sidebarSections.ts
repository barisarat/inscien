export type SidebarNavChildItem = {
  label: string
  href: string
}

export type SidebarNavItem = {
  label: string
  href?: string
  children?: SidebarNavChildItem[]
}

export const topLevelNavItems: SidebarNavItem[] = [
  {
    label: "New chat",
    href: "/ask",
  },
]
