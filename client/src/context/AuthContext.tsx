import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { Role } from '../lib/roles'
import { clearAllDrafts } from '../lib/drafts'

export type Session = {
  id: string
  fullName: string
  email: string
  role: Role
  branch: string | null
  /** The member record this account is linked to; members see the loans filed under it. */
  memberId: string | null
}

export type RegisterInput = {
  fullName: string
  email: string
  password: string
  branch?: string
}

export type RegisterResult = { email: string; emailSent: boolean }

type AuthValue = {
  session: Session | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  /** Creates the account; it is signed in only after verifyEmail. */
  register: (input: RegisterInput) => Promise<RegisterResult>
  verifyEmail: (email: string, code: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  logout: () => Promise<void>
  /** When the current session ends unless renewed (ISO date), or null. */
  expiresAt: string | null
  /** "Stay signed in": a fresh session. */
  refresh: () => Promise<void>
  /** Replaces the session after the profile is edited. */
  updateSession: (session: Session) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ session: Session | null; expiresAt?: string | null }>('/api/auth/me')
      .then((d) => {
        setSession(d.session)
        setExpiresAt(d.expiresAt ?? null)
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const d = await api<{ session: Session; expiresAt?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setSession(d.session)
    setExpiresAt(d.expiresAt ?? null)
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const d = await api<RegisterResult>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return { email: d.email, emailSent: d.emailSent }
  }, [])

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const d = await api<{ session: Session; expiresAt?: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
    setSession(d.session)
    setExpiresAt(d.expiresAt ?? null)
  }, [])

  const resendVerification = useCallback(async (email: string) => {
    await api('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) })
  }, [])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    clearAllDrafts()
    setSession(null)
    setExpiresAt(null)
  }, [])

  const refresh = useCallback(async () => {
    const d = await api<{ session: Session; expiresAt: string }>('/api/auth/refresh', { method: 'POST' })
    setSession(d.session)
    setExpiresAt(d.expiresAt)
  }, [])

  const value = useMemo(
    () => ({ session, loading, login, register, verifyEmail, resendVerification, logout, updateSession: setSession, expiresAt, refresh }),
    [session, loading, login, register, verifyEmail, resendVerification, logout, expiresAt, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
