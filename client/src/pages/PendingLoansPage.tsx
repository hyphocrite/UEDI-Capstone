import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Cpu, FilePlus2, ClipboardCheck } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import ApplicationDetail from '../components/pending-loans/ApplicationDetail'
import SuggestionBadge from '../components/pending-loans/SuggestionBadge'
import IdCheckChip from '../components/pending-loans/IdCheckChip'
import { MascotSays } from '../components/mascot/Mascot'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { awaitingUser, creditScore, loanTypeLabel, openCoMakerRequest } from '../lib/applications'
import type { LoanApplication, ModelInfo } from '../lib/applications'
import { formatDate, formatPeso } from '../lib/format'
import { isSigner, stepShortLabel } from '../lib/roles'

type Tab = 'awaiting' | 'pending' | 'decided'

const HOUR = 60 * 60 * 1000
/** Applications waiting longer than this at one step are called out. */
const OVERDUE_HOURS = 48

/** When the application reached its current step: the last signature, or when it was filed. */
const waitingSince = (a: LoanApplication) => new Date(a.approvals.at(-1)?.signedAt ?? a.createdAt).getTime()

const waitedText = (hours: number) =>
  hours < 1 ? 'less than an hour' : hours < 24 ? `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'}` : `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'}`

/** Amber after a day, red after two. */
const waitTone = (hours: number) => (hours >= OVERDUE_HOURS ? 'text-red-700' : hours >= 24 ? 'text-amber-700' : 'text-brand-600')


export default function PendingLoansPage() {
  const { session } = useAuth()
  const signer = isSigner(session?.role)
  const [tab, setTab] = useState<Tab>(signer ? 'awaiting' : 'pending')
  const [apps, setApps] = useState<LoanApplication[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Waiting times are counted from this, refreshed every minute.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const hoursWaiting = (a: LoanApplication) => (now - waitingSince(a)) / HOUR

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

  const isAwaiting = (a: LoanApplication) => awaitingUser(a, session?.role, session?.id)
  const visible = apps
    .filter((a) => (tab === 'awaiting' ? isAwaiting(a) : tab === 'pending' ? a.status === 'pending' : a.status !== 'pending'))
    // Waiting applications: longest wait first, so nothing sits forgotten. Decided: newest first, as listed.
    .sort((a, b) => (tab === 'decided' ? 0 : waitingSince(a) - waitingSince(b)))
  const overdue = tab === 'decided' ? [] : visible.filter((a) => hoursWaiting(a) >= OVERDUE_HOURS)
  const selected = visible.find((a) => a._id === selectedId) ?? visible[0] ?? null
  const pendingCount = apps.filter((a) => a.status === 'pending').length
  const awaitingCount = apps.filter(isAwaiting).length
  const tabs: { id: Tab; label: string }[] = [
    ...(signer ? [{ id: 'awaiting' as const, label: `Awaiting me (${awaitingCount})` }] : []),
    { id: 'pending', label: `Pending (${pendingCount})` },
    { id: 'decided', label: `Decided (${apps.length - pendingCount})` },
  ]

  const replace = (updated: LoanApplication) => {
    const before = apps.find((a) => a._id === updated._id)
    setApps((list) => list.map((a) => (a._id === updated._id ? updated : a)))
    if (updated.status !== 'pending') {
      setNotice(`${updated.applicationNo} (${updated.applicant.fullName}) was ${updated.status}. It is now under Decided.`)
    } else if (before && before.currentStep !== updated.currentStep && updated.currentStep !== 'none') {
      setNotice(`Signed. ${updated.applicationNo} now waits for the ${stepShortLabel[updated.currentStep]}.`)
      // Keep it on screen after it leaves "Awaiting me".
      if (tab === 'awaiting') {
        setTab('pending')
        setSelectedId(updated._id)
      }
    }
  }

  return (
    <>
      <PageHeader icon={ClipboardCheck}
        title="Pending Loans"
        subtitle="Applications waiting for the Bookkeeper, Credit Committee Chairman, President and Treasurer to sign, with suggestions from three machine learning models."
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New application</Link>}
      />

      <ModelBanner model={model} />

      <div className="mb-4 flex max-w-full flex-wrap gap-1 rounded-lg border border-brand-200 bg-white p-1 sm:inline-flex" role="tablist" aria-label="Application status">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setNotice('') }}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${tab === t.id ? 'bg-brand-800 bg-grad-brand text-white' : 'text-brand-700 hover:bg-brand-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
        </p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
      {overdue.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="status">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <b>{overdue.length} application{overdue.length === 1 ? '' : 's'}</b> waiting more than {OVERDUE_HOURS} hours at one step
            {tab === 'pending' ? `: ${[...new Set(overdue.map((a) => (a.currentStep !== 'none' ? stepShortLabel[a.currentStep] : '')))].filter(Boolean).join(', ')}` : ''}. Oldest first.
          </span>
        </p>
      )}

      {loading && apps.length === 0 ? (
        <p className="py-10 text-center text-sm text-brand-500">Loading applications…</p>
      ) : visible.length === 0 ? (
        <div className="card px-4 py-8 sm:py-12">
          <div className="mx-auto max-w-lg">
            <MascotSays mood={tab === 'decided' ? 'neutral' : 'happy'}
              title={tab === 'awaiting' ? 'Nothing is waiting for your signature.' : tab === 'pending' ? 'No applications are waiting for a decision.' : 'No decisions yet.'}>
              <p className="text-brand-600">
                {tab === 'awaiting'
                  ? "You're all caught up. New applications at your step show up here, oldest first."
                  : tab === 'pending' ? 'New applications appear here as soon as they are filed.' : 'Approved and denied applications are kept here.'}
              </p>
              {tab !== 'decided' && <Link to="/loans/apply" className="btn-primary mt-3"><FilePlus2 className="h-4 w-4" /> New application</Link>}
            </MascotSays>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ul className="card h-fit min-w-0 divide-y divide-brand-50 overflow-hidden lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto" aria-label="Applications">
            {visible.map((a) => {
              const s = a.assessment?.ensemble
              const active = selected?._id === a._id
              return (
                <li key={a._id}>
                  <button onClick={() => setSelectedId(a._id)}
                    className={`card-hover w-full border-l-[3px] px-4 py-3 text-left ${active ? 'border-l-accent bg-brand-50' : 'border-l-transparent hover:bg-brand-50/50'}`}
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
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="text-base font-bold text-brand-800">{formatPeso(a.loan.amount)}</span>
                      <span className="text-xs text-brand-500">{loanTypeLabel[a.loan.loanType]}</span>
                    </p>
                    <p className={`truncate text-sm ${a.loan.purpose ? 'text-brand-700' : 'text-brand-400 italic'}`} title={a.loan.purpose || undefined}>
                      {a.loan.purpose ? `“${a.loan.purpose}”` : 'No reason given'}
                    </p>
                    <p className="mt-0.5 text-xs text-brand-500">
                      {a.applicationNo}
                      {s && ` · credit score ${creditScore(s).toFixed(2)}`}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      <IdCheckChip app={a} />
                      {openCoMakerRequest(a) && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">Co-maker asked for</span>
                      )}
                    </p>
                    {a.status === 'pending' && a.currentStep !== 'none' && (
                      <>
                        <p className="mt-0.5 text-xs font-medium text-brand-700">At {stepShortLabel[a.currentStep]} · {a.approvals.length} of 4 signed</p>
                        <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${waitTone(hoursWaiting(a))}`}>
                          <Clock className="h-3 w-3" /> Waiting {waitedText(hoursWaiting(a))}
                        </p>
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          {selected && (
            <div className="min-w-0 lg:col-span-2">
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
    </p>
  )
}
