import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, HandCoins, MessageSquareText, RefreshCw, XCircle } from 'lucide-react'
import ApprovalPanel from './ApprovalPanel'
import BookkeeperBalances from './BookkeeperBalances'
import ApprovalTracker from './ApprovalTracker'
import ModelCard from './ModelCard'
import DocumentViewer from './DocumentViewer'
import { api } from '../../lib/api'
import { useConfirm } from '../../context/ConfirmContext'
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
  const confirm = useConfirm()
  const [busy, setBusy] = useState<'rescore' | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [error, setError] = useState('')

  const a = app.applicant
  const installment = monthlyInstallment(app.loan)
  const share = installment / a.netTakeHomePay
  const books = app.bookkeeper ?? { longTermBalance: 0, shortTermBalance: 0 }
  // Existing UDEI deductions come out of the same pay.
  const left = a.netTakeHomePay - (books.monthlyPayment ?? 0) - installment
  const e = app.assessment?.ensemble
  const agree = app.assessment ? app.assessment.models.filter((m) => m.suggestion === e?.suggestion).length : 0

  const rescore = async () => {
    const ok = await confirm({
      title: 'Run the models again?',
      message: <p>The suggestion for <b>{app.applicationNo}</b> will be replaced by a new score from the current form and balances. Signatures already given stay.</p>,
      confirmLabel: 'Yes, run again',
    })
    if (!ok) return
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

        {/* What is being asked for and why: the first thing a signer reads. */}
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,15rem)_1fr]">
          <div className="rounded-xl border-2 border-accent/40 bg-emerald-50/60 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-600 uppercase">
              <HandCoins className="h-4 w-4 text-accent" /> Loan amount
            </p>
            <p className="mt-1 text-3xl font-bold text-brand-800">{formatPeso(app.loan.amount)}</p>
            <p className="mt-1 text-sm text-brand-700">
              {loanTypeLabel[app.loan.loanType]} · {app.loan.termMonths} months · {app.loan.monthlyRate}%/month
            </p>
            <p className="text-xs text-brand-500">{app.loan.paymentFrequency === 'quincenal' ? 'Deducted every payday' : 'Deducted monthly'}</p>
          </div>
          <div className={`min-w-0 rounded-xl border-2 p-4 ${app.loan.purpose ? 'border-brand-200 bg-white' : 'border-dashed border-amber-300 bg-amber-50/60'}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-600 uppercase">
              <MessageSquareText className="h-4 w-4 text-accent" /> Reason for the loan
            </p>
            {app.loan.purpose ? (
              <p className="mt-1 text-lg font-semibold break-words text-ink">“{app.loan.purpose}”</p>
            ) : (
              <p className="mt-1 text-sm font-medium text-amber-800">No reason given. Ask the applicant before signing if it matters.</p>
            )}
          </div>
        </div>

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
            {app.explanation && (app.explanation.against.length > 0 || (app.explanation.inFavor?.length ?? 0) > 0) && (
              <div className="mt-4 grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-brand-200 uppercase">In plain words: against</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {app.explanation.against.length ? app.explanation.against.map((r) => <li key={r.feature}>• {r.text}</li>) : <li className="text-brand-200">Nothing stood out.</li>}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-brand-200 uppercase">In favor</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {app.explanation.inFavor?.length ? app.explanation.inFavor.map((r) => <li key={r.feature}>• {r.text}</li>) : <li className="text-brand-200">Nothing stood out.</li>}
                  </ul>
                </div>
                {app.explanation.tips.length > 0 && (
                  <p className="text-sm text-brand-100 sm:col-span-2">
                    <span className="font-semibold text-white">What would help: </span>{app.explanation.tips.join(' ')}
                  </p>
                )}
              </div>
            )}
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
          <Item label="Net pay left after this and existing loans" value={formatPeso(Math.round(left))} warn={left < 5000} />
          <Item label="Interest rate" value={`${app.loan.monthlyRate}% a month`} />
          <Item label="Employment" value={`${employmentStatusLabel[a.employmentStatus]}, ${a.employer}`} warn={a.employmentStatus !== 'permanent'} />
          <Item label="Years as member" value={String(a.yearsAsMember)} />
          <Item label="Past loans (paid late)" value={`${a.priorLoans} (${a.priorLatePayments})`} warn={a.priorLatePayments > 0} />
          <Item label="Residence" value={a.residenceAddress} />
          <Item label="Member ID" value={a.memberId || 'New applicant'} />
        </dl>
        <h4 className="mt-5 mb-2 text-sm font-semibold text-brand-800">UDEI balances (Bookkeeper section)</h4>
        <BookkeeperBalances app={app} />
      </section>

      <section className="card min-w-0 p-4 sm:p-5">
        {(app.coMakers?.length ?? 0) > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 font-semibold text-brand-800">Co-makers</h3>
            <ul className="space-y-1 text-sm">
              {app.coMakers!.map((c) => (
                <li key={c.memberId} className="flex items-center gap-2">
                  {c.status === 'accepted' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : c.status === 'declined' ? <XCircle className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  <span className="font-medium text-ink">{c.name ?? c.memberId}</span>
                  <span className="text-brand-500">No. {c.memberId} · {c.status === 'pending' ? 'has not answered yet' : c.status}{c.note ? ` (“${c.note}”)` : ''}</span>
                </li>
              ))}
            </ul>
            {app.status === 'pending' && app.coMakers!.some((c) => c.status !== 'accepted') && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Signing waits until every co-maker accepts in their co-maker portal{app.coMakers!.some((c) => c.status === 'declined') ? '. A co-maker declined, so this can only be denied.' : '.'}
              </p>
            )}
          </div>
        )}
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
                {d.fileId ? (
                  <button className="btn-ghost ml-auto shrink-0 px-2.5 py-1 text-xs" onClick={() => setViewing(i)}>
                    <Eye className="h-3.5 w-3.5" /> View beside the form
                  </button>
                ) : (
                  <span className="ml-auto shrink-0 text-xs text-brand-400">File not stored</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <ApprovalPanel app={app} onChange={onChange} />
      </section>

      {viewing !== null && app.documents[viewing] && (
        <DocumentViewer app={app} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
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
