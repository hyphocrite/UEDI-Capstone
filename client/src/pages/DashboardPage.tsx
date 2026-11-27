import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarClock, ClipboardCheck, Clock, FilePlus2, HandCoins, KeyRound,
  LayoutDashboard, PenLine, PiggyBank, Siren, Users, Wallet,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import SuggestionBadge from '../components/pending-loans/SuggestionBadge'
import { MascotSays } from '../components/mascot/Mascot'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Suggestion } from '../lib/applications'
import { formatDate, formatPeso } from '../lib/format'
import { formatCentavos } from '../lib/loans'
import { APPROVAL_STEPS, isSigner, stepShortLabel } from '../lib/roles'
import type { ApprovalStep } from '../lib/roles'

// GET /api/dashboard. Loan balances are centavos; application amounts are pesos.
type Dashboard = {
  generatedAt: string
  loans: {
    active: number
    forRelease: number
    outstanding: number
    pastDue: number
    pastDueAmount: number
    dueSoon: { id: string; loanNo: string; borrowerName: string; dueDate: string; amount: number }[]
  }
  applications: {
    pending: number
    awaitingYou: number
    overdue: number
    byStep: Record<ApprovalStep, number>
    decidedThisMonth: { approved: number; denied: number }
    recent: { id: string; applicationNo: string; fullName: string; amount: number; status: 'pending' | 'approved' | 'denied'; currentStep: ApprovalStep | 'none'; suggestion: Suggestion | null; createdAt: string }[]
  }
  members: { total: number; active: number; accountsToLink: number }
  plans: { total: number; behind: number; balance: number }
  /** Treasurer and up only. */
  collections?: { label: string; loans: number; plans: number }[]
}

const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The office dashboard (Loan Officers and up): what needs doing today, then the state of loans,
 * applications, members and retirement plans. Members keep their own Loans page as home.
 */
export default function DashboardPage() {
  const { session } = useAuth()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  // Early warning comes from the ML service, which may be asleep; the rest of the page doesn't wait for it.
  const [risk, setRisk] = useState<{ high: number; watch: number } | null>(null)
  const [hour] = useState(() => new Date().getHours())

  useEffect(() => {
    api<Dashboard>('/api/dashboard')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the dashboard.'))
    api<{ loans: { level: 'high' | 'watch' | 'low' | null }[] }>('/api/early-warning')
      .then((d) => setRisk({ high: d.loans.filter((l) => l.level === 'high').length, watch: d.loans.filter((l) => l.level === 'watch').length }))
      .catch(() => setRisk(null))
  }, [])

  const firstName = session?.fullName.split(' ')[0] ?? ''
  const signer = isSigner(session?.role)

  return (
    <>
      <PageHeader icon={LayoutDashboard}
        title="Dashboard"
        subtitle={`${greeting(hour)}, ${firstName}. Here's where things stand today.`}
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New application</Link>}
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
      {!data && !error && <p className="py-10 text-center text-sm text-brand-500">Loading the dashboard…</p>}

      {data && (
        <>
          <Attention data={data} risk={risk} signer={signer} />

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={HandCoins} label="Active mutual assistance" value={String(data.loans.active)} hint={`${formatCentavos(data.loans.outstanding)} outstanding`} />
            <StatCard icon={ClipboardCheck} label="Pending applications" value={String(data.applications.pending)}
              hint={`${data.applications.decidedThisMonth.approved} approved, ${data.applications.decidedThisMonth.denied} denied this month`} />
            <StatCard icon={Users} label="Members" value={String(data.members.total)} hint={`${data.members.active} active`} />
            <StatCard icon={PiggyBank} label="Retirement plans" value={formatCentavos(data.plans.balance)} hint={`${plural(data.plans.total, 'plan')}, ${data.plans.behind} behind`} />
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Pipeline data={data} />
            {data.collections ? <Collections rows={data.collections} /> : <DueSoon data={data} />}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Recent data={data} />
            {data.collections ? <DueSoon data={data} /> : <Shortcuts role={session?.role} />}
          </div>
        </>
      )}
    </>
  )
}

/** Today's to-do: only what needs someone, each linking to where it's done. Kuwi when it's all clear. */
function Attention({ data, risk, signer }: { data: Dashboard; risk: { high: number; watch: number } | null; signer: boolean }) {
  const items: { show: boolean; icon: LucideIcon; tone: 'red' | 'amber' | 'brand'; title: string; text: string; to: string }[] = [
    { show: signer && data.applications.awaitingYou > 0, icon: PenLine, tone: 'brand', title: plural(data.applications.awaitingYou, 'application'), text: 'waiting for your signature', to: '/loans/pending' },
    { show: data.applications.overdue > 0, icon: Clock, tone: 'red', title: plural(data.applications.overdue, 'application'), text: 'waiting more than 48 hours at one step', to: '/loans/pending' },
    { show: data.loans.pastDue > 0, icon: AlertTriangle, tone: 'red', title: plural(data.loans.pastDue, 'loan'), text: `past due, ${formatCentavos(data.loans.pastDueAmount)} unpaid`, to: '/loans?status=Past%20due' },
    { show: (risk?.high ?? 0) > 0, icon: Siren, tone: 'amber', title: plural(risk?.high ?? 0, 'loan'), text: 'at high risk of missing a payment', to: '/early-warning' },
    { show: data.loans.forRelease > 0, icon: Wallet, tone: 'brand', title: plural(data.loans.forRelease, 'approved mutual assistance', 'approved mutual assistance'), text: 'waiting to be released', to: '/loans?status=For%20release' },
    { show: data.members.accountsToLink > 0, icon: KeyRound, tone: 'amber', title: plural(data.members.accountsToLink, 'account'), text: 'waiting to be linked to a member number', to: '/members?tab=accounts' },
    { show: data.plans.behind > 0, icon: PiggyBank, tone: 'amber', title: plural(data.plans.behind, 'retirement plan'), text: 'behind on contributions', to: '/retirement-plans' },
  ]
  const shown = items.filter((i) => i.show)
  const tones = {
    red: 'border-red-200 bg-red-50 text-red-800 [&_svg]:text-red-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 [&_svg]:text-amber-600',
    brand: 'border-brand-200 bg-brand-50 text-brand-800 [&_svg]:text-accent-dark',
  }

  return (
    <section className="mb-6" aria-labelledby="attention">
      <h2 id="attention" className="mb-3 text-sm font-semibold tracking-wide text-brand-700 uppercase">Needs attention</h2>
      {shown.length === 0 ? (
        <div className="card p-5">
          <MascotSays mood="happy" title="All clear for now.">
            <p className="text-brand-600">No signatures waiting, nothing overdue, and no mutual assistance past due. I'll point things out here as they come in.</p>
          </MascotSays>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.text}>
              <Link to={i.to} className={`card-hover group flex h-full items-start gap-3 rounded-xl border p-4 ${tones[i.tone]}`}>
                <i.icon className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block text-base">{i.title}</b> {i.text}
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-brand-800"><Icon className="h-4 w-4 text-accent-dark" /> {title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const viewAll = (to: string) => (
  <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline">
    View all <ArrowRight className="h-3 w-3" />
  </Link>
)

/** Where pending applications sit in the four-signature chain. */
function Pipeline({ data }: { data: Dashboard }) {
  const { byStep, pending } = data.applications
  const most = Math.max(1, ...APPROVAL_STEPS.map((s) => byStep[s]))
  return (
    <Panel title="Applications by signature step" icon={ClipboardCheck} action={viewAll('/loans/pending')}>
      {pending === 0 ? (
        <p className="py-6 text-center text-sm text-brand-500">No applications waiting for a signature.</p>
      ) : (
        <ol className="space-y-3">
          {APPROVAL_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{i + 1}</span>
              <span className="w-32 shrink-0 text-brand-700">{stepShortLabel[s]}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-50">
                <span className="animate-grow-right block h-full rounded-full bg-accent bg-grad-bar-x" style={{ width: `${(byStep[s] / most) * 100}%`, animationDelay: `${i * 80}ms` }} />
              </span>
              <span className="w-6 text-right font-semibold text-brand-800 tabular-nums">{byStep[s]}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-auto pt-4 text-xs text-brand-500">
        This month: {data.applications.decidedThisMonth.approved} approved, {data.applications.decidedThisMonth.denied} denied.
      </p>
    </Panel>
  )
}

/** Money in over the last six months (Treasurer and up, as on Reports). */
function Collections({ rows }: { rows: NonNullable<Dashboard['collections']> }) {
  const top = Math.max(1, ...rows.map((r) => r.loans + r.plans))
  const total = rows.reduce((s, r) => s + r.loans + r.plans, 0)
  return (
    <Panel title="Money in, last 6 months" icon={BarChart3} action={viewAll('/reports')}>
      <div className="flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={`Money in over the last six months: ${formatCentavos(total)} in all.`}>
        {rows.map((r, i) => {
          const t = r.loans + r.plans
          return (
            <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${r.label}: ${formatCentavos(r.loans)} mutual assistance collections, ${formatCentavos(r.plans)} plan contributions and dues`}>
              {t > 0 ? (
                <div className="animate-grow-up flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(t / top) * 100}%`, animationDelay: `${i * 60}ms` }}>
                  <div className="bg-brand-800 bg-grad-bar-brand" style={{ height: `${(r.loans / t) * 100}%` }} />
                  <div className="bg-accent bg-grad-bar-accent" style={{ height: `${(r.plans / t) * 100}%` }} />
                </div>
              ) : (
                <div className="h-0.5 w-full max-w-10 rounded bg-brand-100" />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-2 sm:gap-3">
        {rows.map((r) => <span key={r.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-brand-500">{r.label.split(' ')[0]}</span>)}
      </div>
      <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-brand-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-800" /> Mutual assistance collections</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Plan contributions and dues</span>
        <span className="ml-auto font-semibold text-brand-800">{formatCentavos(total)}</span>
      </p>
    </Panel>
  )
}

function Recent({ data }: { data: Dashboard }) {
  // At most 5 on the dashboard; "View all" opens the full list.
  const list = data.applications.recent.slice(0, 5)
  return (
    <Panel title="Latest applications" icon={FilePlus2} action={viewAll('/loans/pending')}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-500">No applications yet.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-brand-50">
          {list.map((a) => (
            <li key={a.id} className="row-hover flex items-center justify-between gap-3 rounded-lg px-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{a.fullName}</p>
                <p className="text-xs text-brand-500">
                  {a.applicationNo} · {formatDate(a.createdAt)}
                  {a.status === 'pending' && a.currentStep !== 'none' ? ` · at ${stepShortLabel[a.currentStep]}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold text-brand-800">{formatPeso(a.amount)}</span>
                {a.status !== 'pending' ? <StatusBadge status={a.status === 'approved' ? 'Approved' : 'Denied'} />
                  : a.suggestion ? <SuggestionBadge suggestion={a.suggestion} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function DueSoon({ data }: { data: Dashboard }) {
  const list = data.loans.dueSoon.slice(0, 5)
  return (
    <Panel title="Next payments due" icon={CalendarClock} action={viewAll('/loans')}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-500">No payments coming up.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-brand-50">
          {list.map((l) => (
            <li key={l.id}>
              <Link to={`/loans/${l.id}`} className="row-hover flex items-center justify-between gap-3 rounded-lg px-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{l.borrowerName}</p>
                  <p className="text-xs text-brand-500">{l.loanNo} · due {formatDate(l.dueDate)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand-800">{formatCentavos(l.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** For Loan Officers and Bookkeepers (no money chart): quick ways to the daily pages. */
function Shortcuts({ role }: { role: string | undefined }) {
  const links: [string, string, LucideIcon][] = [
    ['/loans/pending', 'Pending Applications', ClipboardCheck],
    ['/members', 'Members', Users],
    ['/early-warning', 'Early Warning', Siren],
    ['/retirement-plans', 'Retirement Plans', PiggyBank],
    ...(role === 'bookkeeper' ? [['/deductions', 'Payroll Deductions', Wallet] as [string, string, LucideIcon]] : []),
  ]
  return (
    <Panel title="Go to" icon={ArrowRight}>
      <div className="grid gap-2 sm:grid-cols-2">
        {links.map(([to, label, Icon]) => (
          <Link key={to} to={to} className="card-hover flex items-center gap-2 rounded-lg border border-brand-100 px-3 py-2.5 text-sm font-medium text-brand-800">
            <Icon className="h-4 w-4 text-accent-dark" /> {label}
          </Link>
        ))}
      </div>
    </Panel>
  )
}
