import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import AuthShell from '../components/AuthShell'
import { useAuth } from '../context/AuthContext'
import { branches } from '../data/mock'

function validate(v: { fullName: string; email: string; password: string; confirm: string }) {
  if (v.fullName.trim().length < 2) return 'Enter your full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return 'Enter a valid email address.'
  if (v.password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(v.password) || !/[0-9]/.test(v.password))
    return 'Password must include a letter and a number.'
  if (v.password !== v.confirm) return 'Passwords do not match.'
  return ''
}

export default function RegisterPage() {
  const { session, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', branch: branches[0], password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/members" replace />

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validate(form)
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        branch: form.branch,
      })
      navigate('/members', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Staff accounts for UEDI's loan and retirement plan office."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-800 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="fullName">Full name</label>
          <input id="fullName" autoComplete="name" className="input" value={form.fullName} onChange={set('fullName')} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="branch">Branch</label>
          <select id="branch" className="input" value={form.branch} onChange={set('branch')}>
            {branches.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" value={form.password} onChange={set('password')} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" className="input" value={form.confirm} onChange={set('confirm')} />
          </div>
        </div>
        <p className="text-xs text-brand-500">At least 8 characters, with a letter and a number.</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy}>
          <UserPlus className="h-4 w-4" />
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
