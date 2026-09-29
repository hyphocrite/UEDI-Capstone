import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'

export type Session = {
  id: string
  fullName: string
  email: string
  role: 'admin' | 'loan_officer' | 'staff'
  branch: string | null
}

export type RegisterInput = {
  fullName: string
  email: string
  password: string
  branch?: string
}

type AuthValue = {
  session: Session | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ session: Session | null }>('/api/auth/me')
      .then((d) => setSession(d.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const d = await api<{ session: Session }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setSession(d.session)
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const d = await api<{ session: Session }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setSession(d.session)
  }, [])

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, loading, login, register, logout }),
    [session, loading, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
