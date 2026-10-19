import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Hourglass, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import type { LoanApplication } from '../../lib/applications'
import { formatDate } from '../../lib/format'
import { roleLabel } from '../../lib/roles'
import type { ApprovalStep } from '../../lib/roles'

type Props = { app: LoanApplication; onChange: (a: LoanApplication) => void }

/** The outcome once decided; otherwise the sign form for whoever's turn it is, and a waiting note for everyone else. */
export default function ApprovalPanel({ app, onChange }: Props) {
  const { session } = useAuth()

  if (app.status !== 'pending') return <Outcome app={app} />

  const step = app.currentStep as ApprovalStep
  const signedBefore = app.approvals.find((a) => a.signedBy === session?.id)
  if (session?.role !== step) {
    return (
      <p className="flex items-center gap-2 text-sm text-brand-700">
        <Hourglass className="h-4 w-4 shrink-0 text-brand-400" /> Waiting for the {roleLabel[step]}.
      </p>
    )
  }
  if (signedBefore) {
    return (
      <p className="text-sm text-amber-800">
        You already signed this application as {roleLabel[signedBefore.step]}. Another {roleLabel[step]} has to sign this step.
      </p>
    )
  }
  return <SignForm app={app} step={step} onChange={onChange} />
}

function Outcome({ app }: { app: LoanApplication }) {
  // Decided before the approval chain existed.
  if (app.approvals.length === 0 && app.decision) {
    return (
      <div>
        <h3 className="font-semibold text-brand-800">
          {app.decision.decision === 'approved' ? 'Approved' : 'Denied'} by {app.decision.decidedByName} on {formatDate(app.decision.decidedAt!)}
        </h3>
        {app.decision.followedSuggestion === false && <p className="mt-1 text-sm text-amber-700">This went against the ML suggestion.</p>}
        {app.decision.note && <p className="mt-2 text-sm text-brand-700">“{app.decision.note}”</p>}
      </div>
    )
  }
  const last = app.approvals[app.approvals.length - 1]
  const against = app.approvals.filter((a) => a.followedSuggestion === false)
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-brand-800">
        {app.status === 'approved'
          ? 'Approved by all four signers'
          : `Denied by the ${last ? roleLabel[last.step] : 'signer'}${last?.signedByName ? `, ${last.signedByName}` : ''}`}
      </h3>
      {app.status === 'denied' && last?.note && <p className="text-sm text-brand-700">“{last.note}”</p>}
      {against.length > 0 && (
        <p className="text-sm text-amber-700">
          Went against the ML suggestion at: {against.map((a) => roleLabel[a.step]).join(', ')}.
        </p>
      )}
      {app.approvals.filter((a) => a.note && (app.status === 'approved' || a !== last)).map((a) => (
        <p key={a.step} className="text-xs text-brand-600">{roleLabel[a.step]}: “{a.note}”</p>
      ))}
      {app.status === 'approved' && app.loanId && (
        <Link to={`/loans/${app.loanId}`} className="btn-primary mt-2 w-full sm:w-auto">
          Open loan {app.loanNo} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '')

function SignForm({ app, step, onChange }: { app: LoanApplication; step: ApprovalStep; onChange: (a: LoanApplication) => void }) {
  const books = app.bookkeeper
  const [note, setNote] = useState('')
  const [balances, setBalances] = useState({
    longTermBalance: String(books?.longTermBalance ?? 0),
    longTermDueDate: dateInput(books?.longTermDueDate),
    shortTermBalance: String(books?.shortTermBalance ?? 0),
    shortTermDueDate: dateInput(books?.shortTermDueDate),
  })
  const [busy, setBusy] = useState<'approved' | 'denied' | null>(null)
  const [error, setError] = useState('')
  const suggestion = app.assessment?.ensemble.suggestion

  const sign = async (decision: 'approved' | 'denied') => {
    const against = suggestion && suggestion !== 'review' && (suggestion === 'approve') !== (decision === 'approved')
    if (decision === 'denied' && !note.trim()) return setError('Add a note explaining why the application is denied.')
    if (against && !note.trim()) return setError('You are going against the ML suggestion. Add a note explaining why.')
    const long = Number(balances.longTermBalance)
    const short = Number(balances.shortTermBalance)
    if (step === 'bookkeeper' && (!(long >= 0) || !(short >= 0))) return setError('Balances must be 0 or more.')
    setBusy(decision)
    setError('')
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
          bookkeeper:
            step === 'bookkeeper'
              ? {
                  longTermBalance: long,
                  longTermDueDate: balances.longTermDueDate || undefined,
                  shortTermBalance: short,
                  shortTermDueDate: balances.shortTermDueDate || undefined,
                }
              : undefined,
        }),
      })
      onChange(application)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your signature.')
    } finally {
      setBusy(null)
    }
  }

  const field = (key: keyof typeof balances, label: string, type: 'number' | 'date') => (
    <div className="min-w-0">
      <label className="label" htmlFor={key}>{label}</label>
      <input
        id={key}
        type={type}
        min={type === 'number' ? 0 : undefined}
        inputMode={type === 'number' ? 'decimal' : undefined}
        className="input"
        value={balances[key]}
        onChange={(e) => setBalances((b) => ({ ...b, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <>
      <h3 className="mb-1 font-semibold text-brand-800">Your signature as {roleLabel[step]}</h3>
      <p className="mb-4 text-sm text-brand-600">Approving sends the application to the next signer. Denying ends it.</p>

      {step === 'bookkeeper' && (
        <fieldset className="mb-4 rounded-lg bg-brand-50 p-3 sm:p-4">
          <legend className="px-1 text-sm font-semibold text-brand-800">Mutual Assistance balance to date</legend>
          <p className="mb-3 text-xs text-brand-600">Check the balances the applicant's form shows and correct them if needed.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('longTermBalance', 'Long term balance (₱)', 'number')}
            {field('longTermDueDate', 'Long term due date', 'date')}
            {field('shortTermBalance', 'Short term balance (₱)', 'number')}
            {field('shortTermDueDate', 'Short term due date', 'date')}
          </div>
        </fieldset>
      )}

      <label className="label" htmlFor="note">
        Note {suggestion && suggestion !== 'review' ? '(required to deny, or to go against the suggestion)' : '(required to deny)'}
      </label>
      <textarea id="note" rows={3} className="input" value={note} onChange={(ev) => setNote(ev.target.value)}
        placeholder="e.g. Verified payslip with HR by phone." />
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => sign('denied')} disabled={busy !== null}>
          <ThumbsDown className="h-4 w-4" /> {busy === 'denied' ? 'Saving…' : 'Deny'}
        </button>
        <button className="btn-accent" onClick={() => sign('approved')} disabled={busy !== null}>
          <ThumbsUp className="h-4 w-4" /> {busy === 'approved' ? 'Saving…' : 'Approve and sign'}
        </button>
      </div>
    </>
  )
}
