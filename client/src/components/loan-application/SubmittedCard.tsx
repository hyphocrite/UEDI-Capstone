import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import SuggestionBadge from '../pending-loans/SuggestionBadge'
import { creditScore, loanTypeLabel } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatPeso } from '../../lib/format'

type Props = { application: LoanApplication; onNew: () => void; staffView: boolean }

export default function SubmittedCard({ application: app, onNew, staffView }: Props) {
  const ensemble = app.assessment?.ensemble
  if (!staffView) {
    return (
      <div className="card mx-auto max-w-xl p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
        <h1 className="mt-4 text-2xl font-bold break-words text-brand-800">Application {app.applicationNo} submitted</h1>
        <p className="mt-2 text-brand-600">
          You applied for {formatPeso(app.loan.amount)} ({loanTypeLabel[app.loan.loanType]}, {app.loan.termMonths} months).
          The Bookkeeper, Credit Committee Chairman, President and Treasurer will review it in that order, and the Treasurer then releases the money.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/loans" className="btn-primary">Back to My Mutual Assistance</Link>
        </div>
      </div>
    )
  }
  return (
    <div className="card mx-auto max-w-xl p-6 text-center sm:p-8">
      <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
      <h1 className="mt-4 text-2xl font-bold break-words text-brand-800">Application {app.applicationNo} submitted</h1>
      <p className="mt-2 text-brand-600">
        {app.applicant.fullName} applied for {formatPeso(app.loan.amount)} ({loanTypeLabel[app.loan.loanType]}, {app.loan.termMonths} months) with{' '}
        {app.documents.length} supporting document{app.documents.length === 1 ? '' : 's'}.
      </p>

      <div className="mt-5 rounded-lg bg-brand-50 p-4">
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">ML suggestion</p>
        {ensemble ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <SuggestionBadge suggestion={ensemble.suggestion} large />
            <span className="text-sm text-brand-700">Credit score {creditScore(ensemble).toFixed(2)} / 100</span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            Not ready: {app.assessmentError ?? 'the credit model did not answer'}. It can be run again from Pending Applications.
          </p>
        )}
        <p className="mt-2 text-xs text-brand-500">A suggestion from the credit model. The four signers review it on Pending Applications.</p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/loans/pending" className="btn-ghost">Open Pending Applications</Link>
        <button type="button" onClick={onNew} className="btn-primary">New application</button>
      </div>
    </div>
  )
}
