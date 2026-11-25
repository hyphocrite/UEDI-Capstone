import { useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Eye, HandCoins, MessageSquareText, RefreshCw, XCircle } from 'lucide-react'
import ApprovalPanel from './ApprovalPanel'
import CoMakerPanel from './CoMakerPanel'
import IdCheckChip from './IdCheckChip'
import BookkeeperBalances from './BookkeeperBalances'
import ApprovalTracker from './ApprovalTracker'
import ModelCard from './ModelCard'
import ShapWaterfall from './ShapWaterfall'
import DocumentViewer from './DocumentViewer'
import { api } from '../../lib/api'
import { KuwiReasons, KuwiTips, MascotSays } from '../mascot/Mascot'
import { useConfirm } from '../../context/ConfirmContext'
import { creditScore, employmentStatusLabel, loanTypeLabel, monthlyInstallment, scoreLine } from '../../lib/applications'
import type { LoanApplication, Suggestion } from '../../lib/applications'
import { formatDate, formatPeso } from '../../lib/format'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'

const suggestionText: Record<Suggestion, string> = {
  approve: 'Approve',
  review: 'Review carefully',
  deny: 'Deny',
}

/** The suggestion word, coloured by outcome on the dark panel. */
const suggestionTone: Record<Suggestion, string> = {
  approve: 'text-emerald-300',
  review: 'text-amber-300',
  deny: 'text-red-300',
}

export default function ApplicationDetail({ app, onChange }: { app: LoanApplication; onChange: (a: LoanApplication) => void }) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState<'rescore' | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [error, setError] = useState('')
  // The SHAP chart starts open on wide screens and folded on phones.
  const [wideScreen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 640px)').matches)

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
              {app.editedAt && <span className="font-medium text-amber-700"> · changed by the applicant {formatDate(app.editedAt)}</span>}
            </p>
          </div>
          {app.status === 'pending' && (
            <button className="btn-ghost" onClick={rescore} disabled={busy !== null}>
              <RefreshCw className={`h-4 w-4 ${busy === 'rescore' ? 'animate-spin' : ''}`} /> Run models again
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        {/* The ML suggestion is the centre of the page: the signers read it first. */}
        {e ? (
          <div className="mt-4 rounded-xl bg-[#0B422A] bg-grad-hero p-5 text-center text-white sm:p-6">
            <p className="text-xs font-semibold tracking-wider text-brand-200 uppercase">ML suggestion</p>
            <p className={`mt-1 text-4xl font-bold ${suggestionTone[e.suggestion]}`}>{suggestionText[e.suggestion]}</p>
            <p className="mt-2 text-lg text-white">
              Credit score <b className="text-2xl tabular-nums">{creditScore(e).toFixed(2)}</b> <span className="text-brand-200">/ 100</span>
            </p>
            <p className="text-xs text-brand-200">
              {e.creditScore != null ? 'predicted Repayment Performance Score (regression)' : `about ${Math.round((e.defaultProbability ?? 0) * 100)}% estimated chance of default (older model)`}
            </p>
            <div className="text-left">
              <CreditScoreScale score={creditScore(e)} approveLine={scoreLine(app.assessment!.thresholds.approve)} denyLine={scoreLine(app.assessment!.thresholds.deny)} />
            </div>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-100">
              <b className="text-white">{agree} of {app.assessment!.models.length} models agree.</b> The final score combines {app.assessment!.models.map((m) => m.name).join(', ')}
              (stacked ensemble{e.cvMetrics?.r2 != null ? `, tested R² ${e.cvMetrics.r2.toFixed(2)}, about ${e.cvMetrics.mae.toFixed(1)} points off on average` : ''}). It is a suggestion; the four signers decide.
            </p>
            {app.explanation && (app.explanation.against.length > 0 || (app.explanation.inFavor?.length ?? 0) > 0) && (
              <div className="mt-4 border-t border-white/15 pt-4 text-left">
                <MascotSays tone="dark" mood={e.suggestion === 'approve' ? 'happy' : e.suggestion === 'deny' ? 'concerned' : 'neutral'}
                  title="Here's what moved the score, in plain words:">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <KuwiReasons tone="dark" kind="against" items={app.explanation.against.map((r) => r.text)} />
                    <KuwiReasons tone="dark" kind="favor" items={(app.explanation.inFavor ?? []).map((r) => r.text)} />
                  </div>
                  <KuwiTips tone="dark" tips={app.explanation.tips} title="Kuwi recommends (what would help)" />
                </MascotSays>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Not scored yet{app.assessmentError ? `: ${app.assessmentError}` : '.'}
          </p>
        )}

        {/* Under Kuwi's words, the chart they come from. Staff only (members never get the assessment). */}
        {app.assessment && (
          <details className="group mt-4 rounded-xl border border-brand-100 bg-white p-4" open={wideScreen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-brand-800 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-accent-dark" /> Why the model scored it this way (SHAP waterfall)</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-500 transition group-open:rotate-180" />
            </summary>
            <div className="mt-3">
              {app.assessment.shap ? (
                <ShapWaterfall data={app.assessment.shap} />
              ) : (
                <p className="text-sm text-brand-500">
                  Scored before this chart existed.{app.status === 'pending' ? ' Run models again to see it.' : ''}
                </p>
              )}
            </div>
          </details>
        )}

        {/* The three models behind the suggestion, as supporting evidence. */}
        {app.assessment && (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {app.assessment.models.map((m) => <ModelCard key={m.key} model={m} />)}
          </div>
        )}

        {/* What is being asked for and why, in one compact row. */}
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="rounded-xl border-2 border-accent/40 bg-emerald-50/60 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-600 uppercase">
              <HandCoins className="h-4 w-4 text-accent" /> Amount
            </p>
            <p className="mt-0.5 text-2xl font-bold text-brand-800">{formatPeso(app.loan.amount)}</p>
            <p className="text-sm text-brand-700">
              {loanTypeLabel[app.loan.loanType]} · {app.loan.termMonths} months · {app.loan.monthlyRate}%/month
            </p>
            <p className="text-xs text-brand-500">{app.loan.paymentFrequency === 'quincenal' ? 'Deducted every payday' : 'Deducted monthly'}</p>
          </div>
          <div className={`min-w-0 rounded-xl border-2 px-4 py-3 ${app.loan.purpose ? 'border-brand-200 bg-white' : 'border-dashed border-amber-300 bg-amber-50/60'}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand-600 uppercase">
              <MessageSquareText className="h-4 w-4 text-accent" /> Reason for the mutual assistance
            </p>
            {app.loan.purpose ? (
              <p className="mt-0.5 text-lg font-semibold break-words text-ink">“{app.loan.purpose}”</p>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-amber-800">No reason given. Ask the applicant before signing if it matters.</p>
            )}
          </div>
        </div>
        <ApprovalTracker app={app} />
      </section>

      <section className="card min-w-0 p-4 sm:p-5">
        <h3 className="mb-3 font-semibold text-brand-800">Details the models used</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2 sm:grid-cols-3">
          <Item label="Monthly salary" value={formatPeso(a.monthlySalary)} />
          <Item label="Net take-home pay" value={formatPeso(a.netTakeHomePay)} warn={a.netTakeHomePay < a.monthlySalary * 0.4} />
          <Item label={`Installment (${app.loan.paymentFrequency === 'quincenal' ? 'per month, half each quincena' : 'per month'})`} value={formatPeso(Math.round(installment))} />
          <Item label="Share of net pay" value={`${Math.round(share * 100)}%`} warn={share > 0.5} />
          <Item label="Net pay left after this and existing mutual assistance" value={formatPeso(Math.round(left))} warn={left < 5000} />
          <Item label="Interest rate" value={`${app.loan.monthlyRate}% a month`} />
          <Item label="Employment" value={`${employmentStatusLabel[a.employmentStatus]}, ${a.employer}`} warn={a.employmentStatus !== 'permanent'} />
          <Item label="Years as member" value={String(a.yearsAsMember)} />
          <Item label="Past mutual assistance (paid late)" value={`${a.priorLoans} (${a.priorLatePayments})`} warn={a.priorLatePayments > 0} />
          <Item label="Residence" value={a.residenceAddress} />
          <Item label="Member ID" value={a.memberId || 'New applicant'} />
        </dl>
        <h4 className="mt-5 mb-2 text-sm font-semibold text-brand-800">UDEI balances (Bookkeeper section)</h4>
        <BookkeeperBalances app={app} />
      </section>

      <section className="card min-w-0 p-4 sm:p-5">
        <CoMakerPanel app={app} onChange={onChange} />
        <h3 className="mb-3 flex flex-wrap items-center gap-2 font-semibold text-brand-800">Supporting documents <IdCheckChip app={app} /></h3>
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
                  {d.addedAt && (
                    <span className="ml-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800" title="Added by the applicant after filing">
                      Added {formatDate(d.addedAt)}
                    </span>
                  )}
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

/**
 * Credit score 0 to 100, left to right: the deny band at the low (risky) end, review in the middle,
 * approve at the high end. Lines: deny = 100 × (1 − thresholds.deny), approve = 100 × (1 − thresholds.approve).
 */
function CreditScoreScale({ score, approveLine, denyLine }: { score: number; approveLine: number; denyLine: number }) {
  const at = (n: number) => `${Math.min(100, Math.max(0, n))}%`
  const bands = `linear-gradient(to right, #f87171 0%, #f87171 ${at(denyLine)}, #fcd34d ${at(denyLine)}, #fcd34d ${at(approveLine)}, #34d399 ${at(approveLine)}, #34d399 100%)`
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative h-2.5 rounded-full" style={{ backgroundImage: bands }}>
        <div className="animate-slide-in absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded bg-white shadow" style={{ left: at(score) }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-brand-200">
        <span className="absolute left-0">0 · Deny</span>
        <span className="absolute -translate-x-1/2" style={{ left: at((denyLine + approveLine) / 2) }}>Review</span>
        <span className="absolute right-0">Approve · 100</span>
      </div>
    </div>
  )
}
