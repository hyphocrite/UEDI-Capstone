import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, ArrowRight, BellRing, CircleCheck, FileClock, FilePlus2, HandCoins, Handshake, Hourglass, XCircle } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import MyScoreCard from '../components/members/MyScoreCard'
import { KuwiReasons, KuwiTips, MascotSays } from '../components/mascot/Mascot'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { loanTypeLabel } from '../lib/applications'
import type { LoanApplication } from '../lib/applications'
import { formatPeso } from '../lib/format'
import { formatCentavos, formatDay } from '../lib/loans'
import type { Loan } from '../lib/loans'
import { moodForBand } from '../lib/members'
import { roleLabel } from '../lib/roles'
import { useMyScore } from '../lib/useMyScore'

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T }

/** One request per card, so a failed one doesn't blank the page. */
function useLoad<T>(path: string): Load<T> {
  const [state, setState] = useState<Load<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    api<T>(path)
      .then((data) => live && setState({ status: 'ok', data }))
      .catch((err: unknown) => live && setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load this.' }))
    return () => {
      live = false
    }
  }, [path])
  return state
}

type CoMakerPortal = { linked: boolean; requests: { applicationId: string; status: string; myStatus: string }[]; alerts: { loanId: string; text: string }[] }

/**
 * A member's Home: their own member score with Kuwi's tips, then their loans, latest application
 * and co-maker requests at a glance. Members only (staff go to /dashboard).
 */
export default function MemberHomePage() {
  const { session } = useAuth()
  const score = useMyScore()
  const loans = useLoad<{ loans: Loan[] }>('/api/loans')
  const apps = useLoad<{ applications: LoanApplication[] }>('/api/applications')
  const coMaker = useLoad<CoMakerPortal>('/api/comaker')
  const [today] = useState(() => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  const firstName = session?.fullName.split(' ')[0] ?? ''

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800 sm:text-3xl">Hi, {firstName}</h1>
        <p className="mt-1 text-sm text-brand-600">
          {session?.memberId ? <>Member ID <b className="text-brand-800">{session.memberId}</b> · </> : null}{today}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <MyScoreCard state={score} />
          {score.status === 'ok' && score.data.linked && (score.data.score.tips.length > 0 || score.data.score.strengths.length > 0) && (
            <section className="card min-w-0 p-5" aria-label="Kuwi's tips">
              <MascotSays mood={moodForBand(score.data.score.band)} title="Here's how you can raise your score">
                {score.data.score.strengths.length > 0 && (
                  <div className="mt-2"><KuwiReasons kind="favor" title="Doing well" items={score.data.score.strengths} /></div>
                )}
                <KuwiTips tips={score.data.score.tips} />
              </MascotSays>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <LoansCard state={loans} />
          <ApplicationCard state={apps} />
          <CoMakerCard state={coMaker} />
        </div>
      </div>
    </div>
  )
}

function Card({ title, icon: Icon, link, children }: { title: string; icon: LucideIcon; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-brand-800"><Icon className="h-4 w-4 text-accent-dark" /> {title}</h2>
        {link && (
          <Link to={link.to} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline">
            {link.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

const loadingLine = <p className="py-4 text-sm text-brand-500">Loading…</p>

function LoansCard({ state }: { state: Load<{ loans: Loan[] }> }) {
  return (
    <Card title="Your mutual assistance" icon={HandCoins} link={{ to: '/loans', label: 'See mutual assistance' }}>
      {state.status === 'loading' && loadingLine}
      {state.status === 'error' && <EmptyState icon={HandCoins} title="Your mutual assistance could not be loaded." hint={state.message} className="py-4" />}
      {state.status === 'ok' && (() => {
        const active = state.data.loans.filter((l) => l.status === 'active')
        if (!active.length) return <EmptyState icon={HandCoins} title="No active mutual assistance." hint="Mutual assistance shows here once released." className="py-4" />
        const balance = active.reduce((s, l) => s + l.balance, 0)
        const next = active.filter((l) => l.nextDue).sort((a, b) => a.nextDue!.dueDate.localeCompare(b.nextDue!.dueDate))[0]?.nextDue
        const pastDue = active.filter((l) => l.pastDue)
        return (
          <>
            <p className="text-3xl font-bold text-brand-800">{formatCentavos(balance)}</p>
            <p className="text-sm text-brand-600">left to pay{active.length > 1 ? ` across ${active.length} mutual assistance accounts` : ''}</p>
            {next && <p className="mt-2 text-sm text-ink">Next payment: <b>{formatCentavos(next.amount)}</b> on {formatDay(next.dueDate)}</p>}
            {pastDue.length > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {pastDue.length === 1 ? 'Your mutual assistance is' : `${pastDue.length} mutual assistance accounts are`} past due: {formatCentavos(pastDue.reduce((s, l) => s + l.pastDueAmount, 0))} unpaid.
              </p>
            )}
          </>
        )
      })()}
    </Card>
  )
}

function ApplicationCard({ state }: { state: Load<{ applications: LoanApplication[] }> }) {
  return (
    <Card title="Latest application" icon={FileClock}>
      {state.status === 'loading' && loadingLine}
      {state.status === 'error' && <EmptyState icon={FileClock} title="Your applications could not be loaded." hint={state.message} className="py-4" />}
      {state.status === 'ok' && (() => {
        const a = state.data.applications[0]
        if (!a) {
          return (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-brand-600">You haven't applied for mutual assistance yet.</p>
              <Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> Apply for mutual assistance</Link>
            </div>
          )
        }
        return (
          <>
            <p className="font-semibold text-ink">{formatPeso(a.loan.amount)} <span className="font-normal text-brand-600">{loanTypeLabel[a.loan.loanType]} · {a.applicationNo}</span></p>
            {a.status === 'pending' && (
              <p className="mt-1 flex items-center gap-2 text-sm text-brand-700">
                <Hourglass className="h-4 w-4 shrink-0 text-amber-600" />
                Waiting for the {a.currentStep !== 'none' ? roleLabel[a.currentStep] : 'signers'} · {a.approvals.length} of 4 signed
              </p>
            )}
            {a.status === 'approved' && <p className="mt-1 flex items-center gap-2 text-sm text-emerald-800"><CircleCheck className="h-4 w-4" /> Approved{a.loanNo ? `: MA no. ${a.loanNo}` : ''}</p>}
            {a.status === 'denied' && <p className="mt-1 flex items-center gap-2 text-sm text-red-800"><XCircle className="h-4 w-4" /> Not approved. See why on My Mutual Assistance.</p>}
            <Link to="/loans" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">See all applications <ArrowRight className="h-3.5 w-3.5" /></Link>
          </>
        )
      })()}
    </Card>
  )
}

function CoMakerCard({ state }: { state: Load<CoMakerPortal> }) {
  return (
    <Card title="Co-maker" icon={Handshake} link={{ to: '/co-maker', label: 'Open' }}>
      {state.status === 'loading' && loadingLine}
      {state.status === 'error' && <EmptyState icon={Handshake} title="Co-maker requests could not be loaded." hint={state.message} className="py-4" />}
      {state.status === 'ok' && (() => {
        const waiting = state.data.requests.filter((r) => r.status === 'pending' && r.myStatus === 'pending').length
        return (
          <>
            {state.data.alerts.map((a) => (
              <p key={a.loanId} className="mb-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0" /> {a.text}
              </p>
            ))}
            <p className="text-sm text-ink">
              {waiting > 0 ? <><b>{waiting}</b> request{waiting === 1 ? '' : 's'} waiting for your answer.</> : 'No requests waiting for your answer.'}
            </p>
          </>
        )
      })()}
    </Card>
  )
}
