import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Cpu, FilePlus2, RefreshCw, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ModelCard from '../components/pending-loans/ModelCard'
import SuggestionBadge from '../components/pending-loans/SuggestionBadge'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { employmentStatusLabel, loanTypeLabel, monthlyInstallment } from '../lib/applications'
import type { LoanApplication, ModelInfo, Suggestion } from '../lib/applications'
import { formatDate, formatPeso } from '../lib/format'
import { documentType } from '../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../lib/ocr/documentTypes'

type Tab = 'pending' | 'decided'

const suggestionText: Record<Suggestion, string> = {
  approve: 'Approve',
  review: 'Review carefully',
  deny: 'Deny',
}

export default function PendingLoansPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [apps, setApps] = useState<LoanApplication[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { applications } = await api<{ applications: LoanApplication[] }>('/api/applications')
      setApps(applications)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Defer the first load so no state is set synchronously inside the effect.
    void Promise.resolve().then(load)
    api<{ model: ModelInfo }>('/api/applications/model')
      .then((d) => setModel(d.model))
      .catch(() => setModel(null))
  }, [load])

  const visible = apps.filter((a) => (tab === 'pending' ? a.status === 'pending' : a.status !== 'pending'))
  const selected = visible.find((a) => a._id === selectedId) ?? visible[0] ?? null
  const pendingCount = apps.filter((a) => a.status === 'pending').length

  const replace = (updated: LoanApplication) => {
    setApps((list) => list.map((a) => (a._id === updated._id ? updated : a)))
    if (updated.status !== 'pending') {
      setNotice(`${updated.applicationNo} (${updated.applicant.fullName}) was ${updated.status}. It is now under Decided.`)
    }
  }

  return (
    <>
      <PageHeader
        title="Pending Loans"
        subtitle="Applications waiting for a loan officer, with approve or deny suggestions from three machine learning models."
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New application</Link>}
      />

      <ModelBanner model={model} />

      <div className="mb-4 inline-flex rounded-lg border border-brand-200 bg-white p-1" role="tablist" aria-label="Application status">
        {(['pending', 'decided'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setNotice('') }}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === t ? 'bg-brand-800 text-white' : 'text-brand-700 hover:bg-brand-50'}`}>
            {t === 'pending' ? `Pending (${pendingCount})` : `Decided (${apps.length - pendingCount})`}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      {loading && apps.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-500">Loading applications…</p>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center text-brand-600">
          {tab === 'pending' ? 'No applications are waiting for a decision.' : 'No decisions yet.'}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <ul className="card h-fit divide-y divide-brand-50 overflow-hidden" aria-label="Applications">
            {visible.map((a) => {
              const s = a.assessment?.ensemble
              const active = selected?._id === a._id
              return (
                <li key={a._id}>
                  <button onClick={() => setSelectedId(a._id)}
                    className={`w-full px-4 py-3 text-left transition ${active ? 'bg-brand-50' : 'hover:bg-brand-50/50'}`}
                    aria-current={active}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-ink">{a.applicant.fullName}</p>
                      {a.status !== 'pending' ? (
                        <StatusBadge status={a.status === 'approved' ? 'Approved' : 'Denied'} />
                      ) : s ? (
                        <SuggestionBadge suggestion={s.suggestion} />
                      ) : (
                        <span className="text-xs text-brand-400">Not scored</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-brand-500">
                      {a.applicationNo} · {formatPeso(a.loan.amount)} · {loanTypeLabel[a.loan.loanType]}
                      {s && ` · ${Math.round(s.defaultProbability * 100)}% risk`}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>

          {selected && (
            <div className="lg:col-span-2">
              <ApplicationDetail key={selected._id} app={selected} onChange={replace} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function ModelBanner({ model }: { model: ModelInfo | null }) {
  if (!model) {
    return (
      <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" /> The ML service is not reachable, so new suggestions cannot be made. Start it with <code>npm run ml</code>.
      </p>
    )
  }
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
      <Cpu className="h-4 w-4 shrink-0 text-accent" />
      Models trained {formatDate(model.trainedAt)} on {model.rows.toLocaleString()} past loans, checked with {model.validation}.
      {model.sampleData && <strong className="font-semibold text-amber-700">Trained on sample data, not UEDI's real history yet.</strong>}
    </p>
  )
}

function ApplicationDetail({ app, onChange }: { app: LoanApplication; onChange: (a: LoanApplication) => void }) {
  const { session } = useAuth()
  const canDecide = session?.role === 'admin' || session?.role === 'loan_officer'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approved' | 'denied' | 'rescore' | null>(null)
  const [error, setError] = useState('')

  const a = app.applicant
  const installment = monthlyInstallment(app.loan)
  const share = installment / a.netTakeHomePay
  const left = a.netTakeHomePay - installment
  const books = app.bookkeeper ?? { longTermBalance: 0, shortTermBalance: 0 }
  const e = app.assessment?.ensemble
  const agree = app.assessment ? app.assessment.models.filter((m) => m.suggestion === e?.suggestion).length : 0

  const decide = async (decision: 'approved' | 'denied') => {
    const against = e && e.suggestion !== 'review' && (e.suggestion === 'approve') !== (decision === 'approved')
    if (against && !note.trim()) return setError('You are going against the suggestion. Add a note explaining why.')
    setBusy(decision)
    setError('')
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      })
      onChange(application)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.')
    } finally {
      setBusy(null)
    }
  }

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
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-brand-500 uppercase">{app.applicationNo}</p>
            <h2 className="text-xl font-bold text-brand-800">{a.fullName}</h2>
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
              (stacked ensemble{e.cvMetrics ? `, tested AUC ${e.cvMetrics.aucRoc.toFixed(2)}` : ''}). It is a suggestion; the loan officer decides.
            </p>
          </div>
        ) : (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Not scored yet{app.assessmentError ? `: ${app.assessmentError}` : '.'}
          </p>
        )}
      </section>

      {app.assessment && (
        <div className="grid gap-4 xl:grid-cols-3">
          {app.assessment.models.map((m) => <ModelCard key={m.key} model={m} />)}
        </div>
      )}

      <section className="card p-5">
        <h3 className="mb-3 font-semibold text-brand-800">Details the models used</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
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

      <section className="card p-5">
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
                <span>
                  <span className="font-medium text-ink">{d.type ? documentType(d.type as DocumentTypeId)?.label ?? d.type : 'Document'}</span>
                  <span className="text-brand-500"> · {d.fileName}</span>
                  {d.notes?.map((n) => <span key={n} className="block text-xs text-brand-600">{n}</span>)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        {app.status !== 'pending' && app.decision ? (
          <div>
            <h3 className="font-semibold text-brand-800">
              {app.decision.decision === 'approved' ? 'Approved' : 'Denied'} by {app.decision.decidedByName} on {formatDate(app.decision.decidedAt!)}
            </h3>
            {app.decision.followedSuggestion === false && <p className="mt-1 text-sm text-amber-700">This went against the ML suggestion.</p>}
            {app.decision.note && <p className="mt-2 text-sm text-brand-700">“{app.decision.note}”</p>}
          </div>
        ) : canDecide ? (
          <>
            <h3 className="mb-2 font-semibold text-brand-800">Your decision</h3>
            <label className="label" htmlFor="note">Note {e && e.suggestion !== 'review' ? '(required if you go against the suggestion)' : '(optional)'}</label>
            <textarea id="note" rows={3} className="input" value={note} onChange={(ev) => setNote(ev.target.value)}
              placeholder="e.g. Verified payslip with employer by phone." />
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => decide('denied')} disabled={busy !== null}>
                <ThumbsDown className="h-4 w-4" /> {busy === 'denied' ? 'Saving…' : 'Deny loan'}
              </button>
              <button className="btn-accent" onClick={() => decide('approved')} disabled={busy !== null}>
                <ThumbsUp className="h-4 w-4" /> {busy === 'approved' ? 'Saving…' : 'Approve loan'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-brand-600">Only loan officers and administrators can approve or deny loans.</p>
        )}
      </section>
    </div>
  )
}

function Item({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-brand-500">{label}</dt>
      <dd className={`font-semibold ${warn ? 'text-red-700' : 'text-ink'}`}>{value}</dd>
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
