import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Eye, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { api } from '../lib/api'
import { formatCentavos, formatDay } from '../lib/loans'

type Level = 'high' | 'watch' | 'low'
type Warning = {
  loanId: string
  loanNo: string
  borrowerName: string
  memberId: string | null
  balance: number
  nextDue: { amount: number; dueDate: string } | null
  pastDue: boolean
  probability: number | null
  level: Level | null
  reasons: { feature: string; text: string }[]
}
type ModelInfo = {
  trainedOn: string
  rows: number
  horizonDays: number
  thresholds: { watch: number; high: number }
  xgboost: { aucRoc: number; precision: number; recall: number }
  logisticBaseline: { aucRoc: number }
  trainedAt?: string
}

const levelStyle: Record<Level, string> = {
  high: 'bg-red-100 text-red-800',
  watch: 'bg-amber-100 text-amber-800',
  low: 'bg-emerald-50 text-emerald-700',
}
const levelLabel: Record<Level, string> = { high: 'High risk', watch: 'Watch', low: 'Low' }

/**
 * Active loans likely to miss a payment in the next 60 days, before they do: a second use of the
 * ML service. Officers call or visit the borrower while there is still time to help.
 */
export default function EarlyWarningPage() {
  const [list, setList] = useState<Warning[] | null>(null)
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [error, setError] = useState('')
  const [show, setShow] = useState<'flagged' | 'all'>('flagged')

  useEffect(() => {
    api<{ loans: Warning[] }>('/api/early-warning')
      .then((d) => setList(d.loans))
      .catch((err: unknown) => {
        setList([])
        setError(err instanceof Error ? err.message : 'Could not load the early warnings.')
      })
    api<{ model: ModelInfo }>('/api/early-warning/model').then((d) => setModel(d.model)).catch(() => setModel(null))
  }, [])

  const all = useMemo(() => list ?? [], [list])
  const high = all.filter((l) => l.level === 'high')
  const watch = all.filter((l) => l.level === 'watch')
  const shown = show === 'flagged' ? all.filter((l) => l.level === 'high' || l.level === 'watch') : all

  return (
    <>
      <PageHeader
        title="Early Warning"
        subtitle="Active loans likely to miss a payment in the next 60 days, so the office can reach the borrower before it happens."
      />

      {model && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          XGBoost model{model.trainedOn === 'sample' ? <b className="text-amber-700"> trained on sample data, not UDEI's history yet</b> : ` trained on ${model.rows} ${model.trainedOn} snapshots`}:
          AUC {model.xgboost.aucRoc.toFixed(2)} (Logistic Regression baseline {model.logisticBaseline.aucRoc.toFixed(2)}). Of the loans it marks high risk,
          about {Math.round(model.xgboost.precision * 100)}% go on to miss a payment, and it catches about {Math.round(model.xgboost.recall * 100)}% of those that do.
          It is a prompt to check on the borrower, not a decision.
        </p>
      )}
      {error && <p className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><AlertTriangle className="h-4 w-4" /> {error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Siren} label="High risk" value={String(high.length)} hint={model ? `${Math.round(model.thresholds.high * 100)}% chance or more` : undefined} />
        <StatCard icon={Eye} label="Watch" value={String(watch.length)} hint={model ? `${Math.round(model.thresholds.watch * 100)}% to ${Math.round(model.thresholds.high * 100)}%` : undefined} />
        <StatCard icon={ShieldCheck} label="Active loans checked" value={String(all.length)} />
      </div>

      <section className="card min-w-0">
        <div className="flex flex-wrap gap-2 border-b border-brand-100 p-4" role="tablist" aria-label="Show">
          {(['flagged', 'all'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={show === s} onClick={() => setShow(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${show === s ? 'bg-brand-800 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
              {s === 'flagged' ? `High risk and watch (${high.length + watch.length})` : `All active loans (${all.length})`}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-brand-50">
          {shown.map((l) => (
            <li key={l.loanId} className="grid gap-3 px-4 py-4 md:grid-cols-[14rem_1fr_9rem] md:items-start">
              <div className="min-w-0">
                <Link to={`/loans/${l.loanId}`} className="font-semibold text-ink hover:text-accent-dark">{l.borrowerName}</Link>
                <p className="text-xs text-brand-500">{l.loanNo}{l.memberId ? ` · No. ${l.memberId}` : ''}</p>
                <p className="text-xs text-brand-600">
                  Balance {formatCentavos(l.balance)}{l.nextDue ? ` · next due ${formatDay(l.nextDue.dueDate)}` : ''}
                  {l.pastDue && <span className="font-semibold text-red-700"> · already past due</span>}
                </p>
              </div>
              <ul className="space-y-1 text-sm text-brand-800">
                {l.reasons.length ? l.reasons.map((r) => <li key={r.feature} className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {r.text}</li>)
                  : <li className="text-brand-500">No warning signs.</li>}
              </ul>
              <div className="md:text-right">
                {l.level && <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${levelStyle[l.level]}`}>{levelLabel[l.level]}</span>}
                {l.probability !== null && <p className="mt-1 text-xs text-brand-500">{Math.round(l.probability * 100)}% chance</p>}
              </div>
            </li>
          ))}
          {list && shown.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-brand-500">{show === 'flagged' ? 'No active loan shows warning signs right now.' : 'No active loans.'}</li>
          )}
          {!list && <li className="px-4 py-10 text-center text-sm text-brand-500">Checking active loans…</li>}
        </ul>
      </section>
    </>
  )
}
