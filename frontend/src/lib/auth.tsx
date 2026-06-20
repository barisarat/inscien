"use client"

import { createContext, useContext, type ReactNode } from "react"

// InScien is single-user and local with no auth. The provider hands out a fixed
// local user so the chat UI (which gates the saved-sessions sidebar on
// `isAuthenticated`) works without any login flow or backend auth.

export interface DownloadQuota {
  used:         number
  limit:        number | null
  remaining:    number | null
  can_download: boolean
}

interface User {
  id:          number
  first_name:  string
  last_name:   string
  email:       string
  picture_url: string | null
  tier:        string
  is_admin?:   boolean
  created_at:  string | null
  downloads:   DownloadQuota
  marketing_opt_in: boolean
}

export type AccessLevel = "anon" | "auth" | "pro"

interface AuthContextValue {
  user:            User | null
  isLoading:       boolean
  isAuthenticated: boolean
  tier:            AccessLevel
  canAccess:       (requires: AccessLevel) => boolean
  login:           (next?: string) => void
  logout:          () => void
  setTokens:       (access: string, refresh: string) => void
  refreshUser:     () => Promise<void>
}

const LOCAL_USER: User = {
  id:          1,
  first_name:  "Local",
  last_name:   "User",
  email:       "local@inscien",
  picture_url: null,
  tier:        "pro",
  is_admin:    false,
  created_at:  null,
  downloads:   { used: 0, limit: null, remaining: null, can_download: true },
  marketing_opt_in: false,
}

const AuthContext = createContext<AuthContextValue>({
  user:            LOCAL_USER,
  isLoading:       false,
  isAuthenticated: true,
  tier:            "pro",
  canAccess:       () => true,
  login:           () => {},
  logout:          () => {},
  setTokens:       () => {},
  refreshUser:     async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        user:            LOCAL_USER,
        isLoading:       false,
        isAuthenticated: true,
        tier:            "pro",
        canAccess:       () => true,
        login:           () => {},
        logout:          () => {},
        setTokens:       () => {},
        refreshUser:     async () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
