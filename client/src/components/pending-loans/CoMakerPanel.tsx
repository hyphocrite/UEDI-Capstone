import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileSignature, Lightbulb, Printer, UserPlus, Users, XCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../context/ConfirmContext'
import { api, openFile } from '../../lib/api'
import { coMakerFormPath, missingStatements, openCoMakerRequest } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format'
import { useSettings } from '../../lib/settings'
import { roleLabel } from '../../lib/roles'

/** Signers who may ask, case by case, for a co-maker. Same as CO_MAKER_ASKERS on the server. */
const ASKERS = ['bookkeeper', 'crecom_chair', 'president']

/**
 * The co-makers on an application, for the signers: who they are and whether they accepted, the
 * reminder for big loans without one, a signer's request for one (ask or withdraw), and each
 * co-maker's printable statement with its signed copy.
 */
export default function CoMakerPanel({ app, onChange }: { app: LoanApplication; onChange: (a: LoanApplication) => void }) {
  const { session } = useAuth()
  const { settings } = useSettings()
  const confirm = useConfirm()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const coMakers = app.coMakers ?? []
  const request = openCoMakerRequest(app)
  const pending = app.status === 'pending'
  const canAsk = pending && !app.coMakerRequest && !coMakers.some((c) => c.status === 'accepted') && ASKERS.includes(session?.role ?? '')
  const mine = app.coMakerRequest && app.coMakerRequest.by === session?.id
  const missing = app.coMakerStatementRequired ? missingStatements(app) : []

  const call = async (method: 'POST' | 'DELETE', body?: object) => {
    setBusy(true)
    setError('')
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}/co-maker-request`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      })
      onChange(application)
      setAsking(false)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const ask = async () => {
    if (note.trim().length < 3) return setError('Say why a co-maker is needed, for example "Amount is high for 6 months of service".')
    const ok = await confirm({
      title: 'Ask for a co-maker?',
      message: `${app.applicant.fullName} is emailed and asked to name a UDEI member as co-maker. Nobody can approve until a co-maker accepts, or until you withdraw the request.`,
      confirmLabel: 'Ask for a co-maker',
    })
    if (ok) await call('POST', { note: note.trim() })
  }

  const withdraw = async () => {
    const ok = await confirm({ title: 'Withdraw the request?', message: 'Signing can then go on without a co-maker.', confirmLabel: 'Withdraw' })
    if (ok) await call('DELETE')
  }

  const view = (memberId: string) =>
    openFile(`/api/comaker/forms/${app._id}/${encodeURIComponent(memberId)}/statement`).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not open the file.'),
    )

  if (!coMakers.length && !app.coMakerRequest && !app.coMakerSuggested && !canAsk) return null

  return (
    <div className="mb-5 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-brand-800"><Users className="h-4 w-4 text-accent" /> Co-makers</h3>

      {coMakers.length === 0 && !request && (
        <p className="text-sm text-brand-600">
          {app.nonMember ? 'None named.' : 'None named. For UDEI members a co-maker is optional; a signer can ask for one.'}
        </p>
      )}

      {app.coMakerSuggested && pending && !request && (
        <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <span>UDEI usually asks for a co-maker from {formatPeso(settings.coMakersFromAmount)}. This is only a reminder: ask for one if this loan needs it.</span>
        </p>
      )}

      {coMakers.length > 0 && (
        <ul className="space-y-2 text-sm">
          {coMakers.map((c) => (
            <li key={c.memberId} className="flex flex-wrap items-start gap-x-2 gap-y-1">
              {c.status === 'accepted' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : c.status === 'declined' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{c.name ?? c.memberId}</span>
                <span className="text-brand-500"> No. {c.memberId} · {c.status === 'pending' ? 'has not answered yet' : c.status}{c.note ? ` (“${c.note}”)` : ''}</span>
                <span className={`block text-xs ${c.statement ? 'text-emerald-700' : 'text-brand-500'}`}>
                  {c.statement ? `Signed statement uploaded ${formatDate(c.statement.uploadedAt)}` : app.coMakerStatementRequired ? 'Signed statement not uploaded yet (needed before the Treasurer signs)' : 'Signed statement not uploaded (optional for members)'}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap gap-1.5">
                <Link to={coMakerFormPath(app._id, c.memberId)} className="btn-ghost px-2.5 py-1 text-xs"><Printer className="h-3.5 w-3.5" /> Statement</Link>
                {c.statement && (
                  <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => view(c.memberId)}><FileSignature className="h-3.5 w-3.5" /> Signed copy</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pending && coMakers.some((c) => c.status !== 'accepted') && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Approving waits until every co-maker accepts in their co-maker portal{coMakers.some((c) => c.status === 'declined') ? '. A co-maker declined, so this can only be denied.' : '.'}
        </p>
      )}
      {pending && missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The applicant isn’t a UDEI member, so the Treasurer can’t give the final signature until {missing.map((c) => c.name ?? c.memberId).join(' and ')} uploads the signed Co-Maker’s Statement.
        </p>
      )}

      {app.coMakerRequest && pending && (
        <div className={`rounded-lg px-3 py-2 text-sm ${request ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
          <p>
            <b>{app.coMakerRequest.byName}</b> ({roleLabel[app.coMakerRequest.role]}) asked for a co-maker on {formatDateTime(app.coMakerRequest.at)}: “{app.coMakerRequest.note}”
          </p>
          <p className="mt-1">{request ? 'Nobody can approve until a co-maker accepts. Denying is still possible.' : 'A co-maker accepted, so signing can go on.'}</p>
          {mine && request && (
            <button type="button" className="btn-ghost mt-2 px-3 py-1 text-xs" onClick={withdraw} disabled={busy}>Withdraw my request</button>
          )}
        </div>
      )}

      {canAsk && !asking && (
        <button type="button" className="btn-ghost text-sm" onClick={() => setAsking(true)}>
          <UserPlus className="h-4 w-4" /> Ask for a co-maker
        </button>
      )}
      {canAsk && asking && (
        <div className="rounded-lg border border-brand-200 p-3">
          <label className="label" htmlFor="coMakerNote">Why is a co-maker needed? (the applicant sees this)</label>
          <textarea id="coMakerNote" rows={2} className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Amount is high for 6 months of service." />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setAsking(false); setError('') }} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" onClick={ask} disabled={busy}>{busy ? 'Saving…' : 'Ask for a co-maker'}</button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}
