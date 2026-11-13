import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setToken, setUnauthorizedHandler, type Session } from './api'
import { loadToken, saveToken } from './storage'
import { clearReminders } from './reminders'

type Auth = {
  session: Session | null
  ready: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Creates the account and emails a code. Returns the (normalised) email and whether the email went out. */
  register: (body: { fullName: string; email: string; memberNo: string; phone?: string; password: string }) => Promise<{ email: string; emailSent: boolean }>
  verifyEmail: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  // revoke: end the session on the server too. Not when the server already refused the token.
  const signOut = useCallback(async (revoke = true) => {
    if (revoke) await api.logout().catch(() => {})
    setToken(null)
    setSession(null)
    await saveToken(null)
    await clearReminders().catch(() => {})
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut(false))
    ;(async () => {
      const saved = await loadToken()
      if (saved) {
        setToken(saved)
        try {
          setSession((await api.me()).session)
        } catch {
          setToken(null)
        }
      }
      setReady(true)
    })()
  }, [signOut])

  const start = async ({ token, session: s }: { token: string; session: Session }) => {
    setToken(token)
    await saveToken(token)
    setSession(s)
  }

  const value = useMemo<Auth>(
    () => ({
      session,
      ready,
      signIn: async (email, password) => start(await api.login(email, password)),
      register: async (body) => {
        const r = await api.register(body)
        return { email: r.email, emailSent: r.emailSent }
      },
      verifyEmail: async (email, code) => start(await api.verifyEmail(email, code)),
      signOut,
    }),
    [session, ready, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
