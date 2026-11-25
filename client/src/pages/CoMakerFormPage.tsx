import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileSignature, Printer } from 'lucide-react'
import CoMakerForm from '../components/loan-application/CoMakerForm'
import type { CoMakerInfo } from '../components/loan-application/CoMakerForm'
import { api, openFile } from '../lib/api'
import { formatDate } from '../lib/format'

type StatementForm = {
  applicationId: string
  applicationNo: string
  borrowerName: string
  nonMember: boolean
  amount: number
  termMonths: number
  paymentFrequency: 'quincenal' | 'monthly'
  applicationDate: string
  status: 'pending' | 'approved' | 'denied'
  coMaker: CoMakerInfo & { status: 'pending' | 'accepted' | 'declined' }
  statement: { fileName: string; uploadedAt: string } | null
  statementRequired: boolean
  canUpload: boolean
}

/**
 * One co-maker's Co-Maker's Statement on its own, filled from the saved application, to print and
 * sign. Opened by the co-maker from their Co-maker page, by the applicant from My Loans, and by signers.
 */
export default function CoMakerFormPage() {
  const { applicationId = '', memberId = '' } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState<StatementForm | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ form: StatementForm }>(`/api/comaker/forms/${applicationId}/${encodeURIComponent(memberId)}`)
      .then((d) => setForm(d.form))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not open the statement.'))
  }, [applicationId, memberId])

  const viewSigned = () =>
    openFile(`/api/comaker/forms/${applicationId}/${encodeURIComponent(memberId)}/statement`).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not open the file.'),
    )

  return (
    <div className="mx-auto max-w-4xl min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <button type="button" className="btn-ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="flex flex-wrap gap-2">
          {form?.statement && (
            <button type="button" className="btn-ghost" onClick={viewSigned}><FileSignature className="h-4 w-4" /> Signed copy</button>
          )}
          <button type="button" className="btn-primary" onClick={() => window.print()} disabled={!form}><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden" role="alert">{error}</p>}
      {!form && !error && <p className="text-sm text-brand-600">Loading…</p>}

      {form && (
        <>
          <p className="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 print:hidden">
            Print this, have {form.coMaker.name ?? `member ${form.coMaker.memberId}`} sign it, and upload a photo or PDF of the signed copy from the
            Co-maker page.{' '}
            {form.statement
              ? `A signed copy was uploaded ${formatDate(form.statement.uploadedAt)}.`
              : form.statementRequired
                ? 'The applicant isn’t a UDEI member, so the Treasurer’s final signature waits for it.'
                : 'For UDEI members it is optional.'}
          </p>
          <CoMakerForm
            standalone
            coMakers={[form.coMaker]}
            borrowerName={form.borrowerName}
            borrowerIsMember={!form.nonMember}
            amount={form.amount}
            termMonths={form.termMonths}
            quincenal={form.paymentFrequency === 'quincenal'}
            applicationDate={form.applicationDate?.slice(0, 10) ?? ''}
            applicationNo={form.applicationNo}
          />
        </>
      )}
    </div>
  )
}
