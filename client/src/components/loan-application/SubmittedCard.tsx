import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import SuggestionBadge from '../pending-loans/SuggestionBadge'
import { loanTypeLabel } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatPeso } from '../../lib/format'

type Props = { application: LoanApplication; onNew: () => void }

export default function SubmittedCard({ application: app, onNew }: Props) {
  const ensemble = app.assessment?.ensemble
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
            <span className="text-sm text-brand-700">Risk score {Math.round(ensemble.defaultProbability * 100)} / 100</span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            Not ready: {app.assessmentError ?? 'the ML service did not answer'}. An officer can run the models again from Pending Loans.
          </p>
        )}
        <p className="mt-2 text-xs text-brand-500">A loan officer makes the decision on Pending Loans.</p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/loans/pending" className="btn-ghost">Open Pending Loans</Link>
        <button type="button" onClick={onNew} className="btn-primary">New application</button>
      </div>
    </div>
  )
}
