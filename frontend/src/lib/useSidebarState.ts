"use client"

import { useState, useEffect, useLayoutEffect } from "react"

const STORAGE_KEY = "financelab-sidebar-open"

// useLayoutEffect on the client, useEffect on the server.
// Prevents the "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

function readStorage(): boolean {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    return saved !== "0"
  } catch {
    return true
  }
}

export function useSidebarState(): [boolean, () => void] {
  // Always initialise to `false` - identical to the server render.
  // This eliminates the hydration mismatch where the server outputs
  // mainContentClosed but the client (reading sessionStorage) outputs
  // mainContentOpen on the very first render.
  const [isOpen, setIsOpen] = useState(false)

  // `settled` gates the write effect so we never overwrite a saved
  // "open" value with the SSR default "false" on the initial mount.
  const [settled, setSettled] = useState(false)

  // Runs synchronously after DOM mutation but BEFORE the browser paints.
  // Corrects the false → real value with zero visible flash.
  useIsomorphicLayoutEffect(() => {
    if (window.innerWidth <= 768) {
      setIsOpen(false)
    } else {
      setIsOpen(readStorage())
    }
    setSettled(true)
  }, [])

  // Persist user changes to sessionStorage.
  // Guarded by `settled` so the initial correction never writes back.
  useEffect(() => {
    if (!settled) return
    if (typeof window === "undefined" || window.innerWidth <= 768) return
    try {
      window.sessionStorage.setItem(STORAGE_KEY, isOpen ? "1" : "0")
    } catch {}
  }, [isOpen, settled])

  const toggle = () => setIsOpen((prev) => !prev)

  return [isOpen, toggle]
}