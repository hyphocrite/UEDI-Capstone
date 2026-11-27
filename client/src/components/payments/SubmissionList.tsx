import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Paperclip, Upload } from 'lucide-react'
import Pagination from '../Pagination'
import { usePaged } from '../../lib/usePaged'
import { openFile } from '../../lib/api'
import { formatCentavos, formatDay } from '../../lib/loans'
import { PROOF_ACCEPT, submissionStatusLabel, submissionStatusTone, uploadProof } from '../../lib/payments'
import type { PaymentSubmission } from '../../lib/payments'

export function SubmissionStatusChip({ s }: { s: Pick<PaymentSubmission, 'status' | 'voided'> }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ${submissionStatusTone[s.status]}`}>
      {submissionStatusLabel[s.status]}{s.voided?.reason ? ' · voided' : ''}
    </span>
  )
}

/**
 * Payments sent outside payroll on one loan, newest first, with where each one is. Members can add
 * the proof while it waits for the Treasurer; staff get a link to it on the Payments page.
 */
export default function SubmissionList({ submissions, staff = false, onChange }: {
  submissions: PaymentSubmission[]
  staff?: boolean
  onChange?: (s: PaymentSubmission) => void
}) {
  const [error, setError] = useState('')
  const { anchor: pagedAnchor, ...paged } = usePaged(submissions)
  if (!submissions.length) return <p className="px-4 py-6 text-sm text-brand-500 sm:px-5">No payments sent outside payroll yet.</p>
  return (
    <>
      {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-5" role="alert">{error}</p>}
      <div ref={pagedAnchor} className="scroll-mt-4">
      <ul className="divide-y divide-brand-50">
        {paged.pageRows.map((s) => (
          <li key={s._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="font-semibold text-ink">
                {formatCentavos(s.amount)} <span className="font-normal">{s.methodLabel} · paid {formatDay(s.paidAt)}</span>
              </p>
              <p className="text-xs text-brand-600">
                {s.reference && <>Ref. {s.reference} · </>}
                {s.received?.orNumber && <>OR {s.received.orNumber} · </>}
                {s.source === 'office' ? `entered by ${s.submittedByName}` : 'sent by the member'}
              </p>
              {s.status === 'rejected' && <p className="mt-1 text-xs break-words text-red-700">Rejected by {s.rejected?.byName}: {s.rejected?.reason}</p>}
              {s.voided?.reason && <p className="mt-1 text-xs break-words text-red-700">Payment voided by {s.voided.byName}: {s.voided.reason}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SubmissionStatusChip s={s} />
              {s.proof && (
                <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => openFile(`/api/payments/${s._id}/proof`).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the file.'))}>
                  <Paperclip className="h-3.5 w-3.5" /> Proof
                </button>
              )}
              {!staff && s.status === 'submitted' && onChange && <ProofUpload s={s} onDone={onChange} onError={setError} />}
              {staff && (
                <Link to={`/payments?id=${s._id}`} className="btn-ghost px-2.5 py-1 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Open</Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={paged.page} pageSize={paged.perPage} total={paged.total} onPage={paged.setPage} />
      </div>
    </>
  )
}

function ProofUpload({ s, onDone, onError }: { s: PaymentSubmission; onDone: (s: PaymentSubmission) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    onError('')
    try {
      onDone(await uploadProof(s._id, file))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not upload the proof.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : s.proof ? 'Replace proof' : 'Add proof'}
      </button>
      <input ref={input} type="file" accept={PROOF_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </>
  )
}
