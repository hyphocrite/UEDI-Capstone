import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { CoMakerField } from '../loan-application/CoMakersSection'
import { api } from '../../lib/api'
import { openCoMakerRequest } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatDate } from '../../lib/format'
import { roleLabel } from '../../lib/roles'

/**
 * On My Loans: a signer asked for a co-maker. Shows who asked and why, and lets the applicant name
 * one or two UDEI members (PUT /api/applications/:id/co-makers). They then accept on their Co-maker page.
 */
export default function CoMakerRequestNotice({ app, onChange }: { app: LoanApplication; onChange: (a: LoanApplication) => void }) {
  const request = openCoMakerRequest(app)
  const named = app.coMakers ?? []
  const [ids, setIds] = useState<[string, string]>([named[0]?.memberId ?? '', named[1]?.memberId ?? ''])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!request) return null

  const waiting = named.filter((c) => c.status === 'pending')
  const save = async () => {
    const list = ids.map((s) => s.trim()).filter(Boolean)
    if (!list.length) return setError('Enter the member number of a UDEI member who will be your co-maker.')
    setBusy(true)
    setError('')
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}/co-makers`, {
        method: 'PUT',
        body: JSON.stringify({ coMakers: list }),
      })
      onChange(application)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the co-maker.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
      <p className="font-semibold">A co-maker is needed for this application</p>
      <p className="mt-1">
        The {roleLabel[request.role]}, {request.byName}, asked on {formatDate(request.at)}: “{request.note}”
      </p>
      <p className="mt-1">
        {waiting.length
          ? `Waiting for ${waiting.map((c) => c.name ?? c.memberId).join(' and ')} to accept on their Co-maker page. Signing goes on once a co-maker accepts.`
          : 'Name a UDEI member who vouches for this loan. They accept on their Co-maker page, and signing then goes on.'}
      </p>
      {!open ? (
        <button type="button" className="btn-ghost mt-2 bg-white px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> {named.length ? 'Change co-makers' : 'Add a co-maker'}
        </button>
      ) : (
        <div className="mt-3 rounded-lg bg-white p-3 text-ink">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CoMakerField id={`cm1-${app._id}`} label="Co-maker" value={ids[0]} onChange={(v) => setIds([v, ids[1]])} applicantId={app.applicant.memberId ?? ''} />
            <CoMakerField id={`cm2-${app._id}`} label="Second co-maker (optional)" value={ids[1]} onChange={(v) => setIds([ids[0], v])} applicantId={app.applicant.memberId ?? ''} />
          </div>
          {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setError('') }} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Send to the co-maker'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
