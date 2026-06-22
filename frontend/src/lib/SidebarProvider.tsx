"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
} from "react"

const STORAGE_KEY = "inscien-sidebar-open"

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

interface SidebarContextValue {
  isOpen: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  isOpen: false,
  toggle: () => {},
})

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [settled, setSettled] = useState(false)

  useIsomorphicLayoutEffect(() => {
    if (window.innerWidth <= 768) {
      setIsOpen(false)
    } else {
      try {
        const saved = window.sessionStorage.getItem(STORAGE_KEY)
        setIsOpen(saved !== "0")
      } catch {
        setIsOpen(true)
      }
    }
    setSettled(true)
  }, [])

  useEffect(() => {
    if (!settled) return
    if (typeof window === "undefined" || window.innerWidth <= 768) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, isOpen ? "1" : "0")
    } catch {}
  }, [isOpen, settled])

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  return (
    <SidebarContext.Provider value={{ isOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext)
}