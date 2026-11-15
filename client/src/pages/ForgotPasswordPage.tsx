import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Send } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import PasswordInput from '../components/PasswordInput'
import { useAuth } from '../context/AuthContext'

type State = { email?: string } | null

/**
 * Forgot password, in two steps on one page:
 *   1. the email address: a 6-digit code is emailed, the same kind as sign-up verification;
 *   2. the code and a new password: then the person is signed in, and other sessions end.
 */
export default function ForgotPasswordPage() {
  const { session, requestPasswordReset, resetPassword } = useAuth()
  const navigate = useNavigate()
  const state = useLocation().state as State

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState(state?.email ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.')
    setError('')
    setBusy(true)
    try {
      await requestPasswordReset(email.trim())
      setNotice(
        step === 'email'
          ? `If an account uses ${email.trim()}, we sent it a 6-digit code. It expires in 15 minutes.`
          : 'If that account exists, a new code is on its way. Codes can be resent once a minute.',
      )
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.')
    } finally {
      setBusy(false)
    }
  }

  const onReset = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the email.')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return setError('The new password needs at least 8 characters, with a letter and a number.')
    }
    if (password !== confirm) return setError('The two passwords do not match.')
    setError('')
    setBusy(true)
    try {
      await resetPassword(email.trim(), code.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  const messages = (
    <>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="status">{notice}</p>}
    </>
  )

  return (
    <AuthShell
      title={step === 'email' ? 'Forgot your password?' : 'Set a new password'}
      subtitle={
        step === 'email'
          ? "Enter your account's email. We'll send a 6-digit code, the same way we verified your email."
          : 'Enter the code from the email and choose a new password.'
      }
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-800 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" autoFocus className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {messages}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            <Send className="h-4 w-4" />
            {busy ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
      ) : (
        <form onSubmit={onReset} className="space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <div className="flex gap-2">
              <input id="email" type="email" className="input" value={email} readOnly />
              <button type="button" className="btn-ghost shrink-0" onClick={() => { setStep('email'); setNotice(''); setError('') }}>
                Change
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="code">Reset code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              className="input text-center text-xl tracking-[0.5em]" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="new-password">New password</label>
            <PasswordInput id="new-password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
            <p className="mt-1 text-xs text-brand-600">At least 8 characters, with a letter and a number.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">Confirm new password</label>
            <PasswordInput id="confirm-password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {messages}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
            <KeyRound className="h-4 w-4" />
            {busy ? 'Saving…' : 'Save new password and sign in'}
          </button>
          <button type="button" onClick={() => void sendCode()} disabled={busy} className="w-full text-sm font-semibold text-brand-800 hover:underline">
            Send a new code
          </button>
        </form>
      )}
    </AuthShell>
  )
}
