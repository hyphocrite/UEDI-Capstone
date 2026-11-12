import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Save } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import type { Session } from '../context/AuthContext'
import { useSettings } from '../lib/settings'
import { api } from '../lib/api'
import { roleLabel } from '../lib/roles'

type Message = { tone: 'ok' | 'error'; text: string } | null

function Notice({ message }: { message: Message }) {
  if (!message) return null
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
      role={message.tone === 'ok' ? 'status' : 'alert'}>
      {message.text}
    </p>
  )
}

export default function ProfilePage() {
  const { branches } = useSettings().settings
  const { session, updateSession } = useAuth()
  const confirm = useConfirm()
  const [details, setDetails] = useState({ fullName: session?.fullName ?? '', branch: session?.branch ?? '' })
  const [detailsMsg, setDetailsMsg] = useState<Message>(null)
  const [savingDetails, setSavingDetails] = useState(false)

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState<Message>(null)
  const [savingPw, setSavingPw] = useState(false)

  if (!session) return null

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault()
    if (details.fullName.trim().length < 2) return setDetailsMsg({ tone: 'error', text: 'Enter your full name.' })
    const ok = await confirm({
      title: 'Save your profile?',
      message: <p>Your name becomes <b>{details.fullName.trim()}</b>{details.branch ? <> and your branch <b>{details.branch}</b></> : ''}. New signatures and records will show this name.</p>,
      confirmLabel: 'Yes, save',
    })
    if (!ok) return
    setSavingDetails(true)
    setDetailsMsg(null)
    try {
      const d = await api<{ session: Session }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: details.fullName.trim(), branch: details.branch }),
      })
      updateSession(d.session)
      setDetailsMsg({ tone: 'ok', text: 'Your profile is saved.' })
    } catch (err) {
      setDetailsMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save your profile.' })
    } finally {
      setSavingDetails(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pw.newPassword.length < 8 || !/[A-Za-z]/.test(pw.newPassword) || !/[0-9]/.test(pw.newPassword))
      return setPwMsg({ tone: 'error', text: 'The new password needs at least 8 characters, with a letter and a number.' })
    if (pw.newPassword !== pw.confirm) return setPwMsg({ tone: 'error', text: 'The new passwords do not match.' })
    const ok = await confirm({
      title: 'Change your password?',
      message: <p>From now on you sign in with the new password. Other devices stay signed in until their session ends.</p>,
      confirmLabel: 'Yes, change it',
    })
    if (!ok) return
    setSavingPw(true)
    setPwMsg(null)
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      })
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      setPwMsg({ tone: 'ok', text: 'Your password is changed.' })
    } catch (err) {
      setPwMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change your password.' })
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" subtitle="Your account details and password." />

      <section className="card mb-6 p-5">
        <h2 className="mb-4 font-semibold text-brand-800">Account</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-brand-500">Email</dt>
            <dd className="font-medium break-all text-ink">{session.email}</dd>
          </div>
          <div>
            <dt className="text-brand-500">Access</dt>
            <dd className="font-medium text-ink">{roleLabel[session.role]}</dd>
          </div>
          <div>
            <dt className="text-brand-500">Member ID</dt>
            <dd className="font-medium text-ink">
              {session.memberId ?? <span className="text-amber-700">Not linked yet</span>}
            </dd>
          </div>
        </dl>
        {!session.memberId && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            To see your loans and apply online, ask the UDEI office to link this account to your member record.
          </p>
        )}
      </section>

      <form onSubmit={saveDetails} className="card mb-6 space-y-4 p-5" noValidate>
        <h2 className="font-semibold text-brand-800">Personal information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" autoComplete="name" className="input" value={details.fullName}
              onChange={(e) => setDetails((d) => ({ ...d, fullName: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="branch">Branch</label>
            <select id="branch" className="input" value={details.branch}
              onChange={(e) => setDetails((d) => ({ ...d, branch: e.target.value }))}>
              <option value="">Not set</option>
              {details.branch && !branches.includes(details.branch) && <option>{details.branch}</option>}
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <Notice message={detailsMsg} />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={savingDetails}>
            <Save className="h-4 w-4" /> {savingDetails ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-5" noValidate>
        <h2 className="font-semibold text-brand-800">Change password</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="currentPassword">Current password</label>
            <input id="currentPassword" type="password" autoComplete="current-password" className="input" value={pw.currentPassword}
              onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" autoComplete="new-password" className="input" value={pw.newPassword}
              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" className="input" value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          </div>
        </div>
        <Notice message={pwMsg} />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={savingPw}>
            <KeyRound className="h-4 w-4" /> {savingPw ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}
