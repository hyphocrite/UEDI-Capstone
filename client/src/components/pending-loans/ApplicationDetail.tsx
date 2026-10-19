import { useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import ApprovalPanel from './ApprovalPanel'
import ApprovalTracker from './ApprovalTracker'
import ModelCard from './ModelCard'
import { api } from '../../lib/api'
import { employmentStatusLabel, loanTypeLabel, monthlyInstallment } from '../../lib/applications'
import type { LoanApplication, Suggestion } from '../../lib/applications'
import { formatDate, formatPeso } from '../../lib/format'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'

const suggestionText: Record<Suggestion, string> = {
  approve: 'Approve',
  review: 'Review carefully',
  deny: 'Deny',
}

export default function ApplicationDetail({ app, onChange }: { app: LoanApplication; onChange: (a: LoanApplication) => void }) {
  const [busy, setBusy] = useState<'rescore' | null>(null)
  const [error, setError] = useState('')

  const a = app.applicant
  const installment = monthlyInstallment(app.loan)
  const share = installment / a.netTakeHomePay
  const left = a.netTakeHomePay - installment
  const books = app.bookkeeper ?? { longTermBalance: 0, shortTermBalance: 0 }
  const e = app.assessment?.ensemble
  const agree = app.assessment ? app.assessment.models.filter((m) => m.suggestion === e?.suggestion).length : 0

  const rescore = async () => {
    setBusy('rescore')
    setError('')
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}/assess`, { method: 'POST' })
      onChange(application)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the models.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-brand-500 uppercase">{app.applicationNo}</p>
            <h2 className="text-xl font-bold break-words text-brand-800">{a.fullName}</h2>
            <p className="text-sm text-brand-600">
              {formatPeso(app.loan.amount)} {loanTypeLabel[app.loan.loanType].toLowerCase()} loan over {app.loan.termMonths} months
              {app.loan.purpose && ` for ${app.loan.purpose.toLowerCase()}`}
            </p>
            <p className="mt-1 text-xs text-brand-500">
              Submitted {formatDate(app.createdAt)}{app.submittedByName && ` by ${app.submittedByName}`}
            </p>
          </div>
          {app.status === 'pending' && (
            <button className="btn-ghost" onClick={rescore} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 ${busy === 'rescore' ? 'animate-spin' : ''}`} /> Run models again
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        {e ? (
          <div className="mt-5 rounded-xl bg-[#0B422A] p-5 text-white">
            <p className="text-sm text-brand-200">ML suggestion</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-3xl font-bold">{suggestionText[e.suggestion]}</p>
              <p className="text-brand-100">{Math.round(e.defaultProbability * 100)}% estimated chance of default</p>
            </div>
            <RiskScale value={e.defaultProbability} approve={app.assessment!.thresholds.approve} deny={app.assessment!.thresholds.deny} />
            <p className="mt-3 text-sm text-brand-100">
              {agree} of 3 models agree. The final score combines XGBoost, Random Forest and Logistic Regression
              (stacked ensemble{e.cvMetrics ? `, tested AUC ${e.cvMetrics.aucRoc.toFixed(2)}` : ''}). It is a suggestion; the four signers decide.
            </p>
          </div>
        ) : (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Not scored yet{app.assessmentError ? `: ${app.assessmentError}` : '.'}
          </p>
        )}
        <ApprovalTracker app={app} />
      </section>

      {app.assessment && (
        <div className="grid gap-4 xl:grid-cols-3">
          {app.assessment.models.map((m) => <ModelCard key={m.key} model={m} />)}
        </div>
      )}

      <section className="card min-w-0 p-4 sm:p-5">
        <h3 className="mb-3 font-semibold text-brand-800">Details the models used</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2 sm:grid-cols-3">
          <Item label="Monthly salary" value={formatPeso(a.monthlySalary)} />
          <Item label="Net take-home pay" value={formatPeso(a.netTakeHomePay)} warn={a.netTakeHomePay < a.monthlySalary * 0.4} />
          <Item label={`Installment (${app.loan.paymentFrequency === 'quincenal' ? 'per month, half each quincena' : 'per month'})`} value={formatPeso(Math.round(installment))} />
          <Item label="Share of net pay" value={`${Math.round(share * 100)}%`} warn={share > 0.5} />
          <Item label="Net pay left after loan" value={formatPeso(Math.round(left))} warn={left < 5000} />
          <Item label="Interest rate" value={`${app.loan.monthlyRate}% a month`} />
          <Item label="UEDI balances (long / short term)" value={`${formatPeso(books.longTermBalance)} / ${formatPeso(books.shortTermBalance)}`} />
          <Item label="Employment" value={`${employmentStatusLabel[a.employmentStatus]}, ${a.employer}`} warn={a.employmentStatus !== 'permanent'} />
          <Item label="Years as member" value={String(a.yearsAsMember)} />
          <Item label="Past loans (paid late)" value={`${a.priorLoans} (${a.priorLatePayments})`} warn={a.priorLatePayments > 0} />
          <Item label="Residence" value={a.residenceAddress} />
          <Item label="Member ID" value={a.memberId || 'New applicant'} />
        </dl>
      </section>

      <section className="card min-w-0 p-4 sm:p-5">
        <h3 className="mb-3 font-semibold text-brand-800">Supporting documents</h3>
        {app.documents.length === 0 ? (
          <p className="text-sm text-brand-500">No documents were attached.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {app.documents.map((d, i) => (
              <li key={`${d.fileName}-${i}`} className="flex items-start gap-2">
                {d.verdict === 'verified' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : d.verdict === 'mismatch' || d.verdict === 'unreadable' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <span className="min-w-0 break-words">
                  <span className="font-medium text-ink">{d.type ? documentType(d.type as DocumentTypeId)?.label ?? d.type : 'Document'}</span>
                  <span className="text-brand-500"> · {d.fileName}</span>
                  {d.notes?.map((n) => <span key={n} className="block text-xs text-brand-600">{n}</span>)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <ApprovalPanel app={app} onChange={onChange} />
      </section>
    </div>
  )
}

function Item({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-brand-500">{label}</dt>
      <dd className={`font-semibold break-words ${warn ? 'text-red-700' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function RiskScale({ value, approve, deny }: { value: number; approve: number; deny: number }) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, n * 100))}%`
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-400">
        <div className="absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded bg-white shadow" style={{ left: pct(value) }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-brand-200">
        <span className="absolute left-0">Approve</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct((approve + deny) / 2) }}>Review</span>
        <span className="absolute right-0">Deny</span>
      </div>
    </div>
  )
}
