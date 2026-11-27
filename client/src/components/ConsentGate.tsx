import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { Session } from '../context/AuthContext'
import { api } from '../lib/api'
import { CONSENT } from '../lib/privacy'

/**
 * Accounts made before consent was asked (staff too), or before the notice's current version, agree
 * once after sign-in before they can continue.
 */
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { session, updateSession, logout } = useAuth()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!session?.needsConsent) return <>{children}</>

  const submit = async () => {
    if (!agree) return setError('Tick the box to agree to the Privacy Notice.')
    setBusy(true)
    setError('')
    try {
      const r = await api<{ session: Session }>('/api/me/consent', { method: 'POST', body: JSON.stringify({ privacyConsent: true }) })
      updateSession(r.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50/40 p-4">
      <div className="card w-full max-w-lg p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-800 bg-grad-brand text-white"><ShieldCheck className="h-5 w-5" /></span>
        <h1 className="mt-3 text-xl font-bold text-brand-800">Before you continue</h1>
        <p className="mt-1 text-sm text-brand-700">
          UDEI now asks everyone to agree to its <Link to="/privacy" target="_blank" className="font-semibold underline">Privacy Notice</Link> (Data Privacy Act of 2012).
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" className="mt-1 shrink-0" checked={agree} onChange={(e) => { setAgree(e.target.checked); setError('') }} />
          <span>{CONSENT.account}</span>
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => void logout()}>Sign out</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Agree and continue'}</button>
        </div>
      </div>
    </div>
  )
}
