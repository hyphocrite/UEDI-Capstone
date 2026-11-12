import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { useAuth } from '../context/AuthContext'

type State = { email?: string; emailSent?: boolean; fromLogin?: boolean } | null

export default function VerifyEmailPage() {
  const { session, verifyEmail, resendVerification } = useAuth()
  const navigate = useNavigate()
  const state = useLocation().state as State

  const [email, setEmail] = useState(state?.email ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState(state?.emailSent === false ? "We couldn't send the email. Use \"Send a new code\" below." : '')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.')
    setError('')
    setBusy(true)
    try {
      await verifyEmail(email.trim(), code.trim())
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the email.')
    } finally {
      setBusy(false)
    }
  }

  const onResend = async () => {
    if (!email.trim()) return setError('Enter your email address first.')
    setError('')
    try {
      await resendVerification(email.trim())
      setNotice('If that account is waiting for verification, a new code is on its way. Codes can be resent once a minute.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a new code.')
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle={
        state?.fromLogin
          ? 'Your account is not verified yet. Enter the code we emailed you, or send a new one.'
          : 'We sent a 6-digit code to your email. It expires in 15 minutes.'
      }
      footer={
        <>
          Already verified?{' '}
          <Link to="/login" className="font-semibold text-brand-800 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email}
            onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(state?.email)} />
        </div>
        <div>
          <label className="label" htmlFor="code">Verification code</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            className="input text-center text-xl tracking-[0.5em]" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {notice && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="status">{notice}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
          <MailCheck className="h-4 w-4" />
          {busy ? 'Verifying…' : 'Verify and sign in'}
        </button>
        <button type="button" onClick={onResend} className="w-full text-sm font-semibold text-brand-800 hover:underline">
          Send a new code
        </button>
      </form>
    </AuthShell>
  )
}
