import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, FilePlus2, HandCoins, Search, Wallet, TrendingUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { atLeast } from '../lib/roles'
import { loanTypeLabel } from '../lib/applications'
import { percent } from '../lib/format'
import { displayStatus, formatCentavos, formatDay, missedDeductionText } from '../lib/loans'
import type { Loan, LoanDisplayStatus } from '../lib/loans'

const statuses: ('All' | LoanDisplayStatus | 'Missed deductions')[] = ['All', 'For release', 'Active', 'Past due', 'Fully paid', 'Missed deductions']

/** A member's yearly loan totals from UDEI's spreadsheet ledger (GET /api/loans/carried). Amounts in centavos. */
type Carried = {
  memberId: string
  fullName: string
  remarks: string | null
  asOf: string
  balanceStartOfYear: number
  appliedThisYear: number
  payments: number
  interest: number
  balance: number
  loansThisYear: number
}

export default function LoansPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  // Members get only their own loans from the API; staff see everyone's.
  const staffView = atLeast(session?.role, 'loan_officer')
  const [loans, setLoans] = useState<Loan[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<(typeof statuses)[number]>('All')
  const [query, setQuery] = useState('')
  const [carried, setCarried] = useState<Carried[]>([])

  useEffect(() => {
    api<{ loans: Loan[] }>('/api/loans')
      .then((d) => setLoans(d.loans))
      .catch((err: unknown) => {
        setLoans([])
        setError(err instanceof Error ? err.message : 'Could not load loans.')
      })
    api<{ carried: Carried[] }>('/api/loans/carried')
      .then((d) => setCarried(d.carried))
      .catch(() => setCarried([]))
  }, [])

  const carriedShown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return carried.filter((c) => !q || c.memberId.toLowerCase().includes(q) || c.fullName.toLowerCase().includes(q))
  }, [carried, query])
  const carriedTotal = carried.reduce((s, c) => s + c.balance, 0)
  const carriedOpen = carried.filter((c) => c.balance > 0).length

  const all = useMemo(() => loans ?? [], [loans])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (l) =>
        (status === 'All' || (status === 'Missed deductions' ? !!missedDeductionText(l) : displayStatus(l) === status)) &&
        (!q || l.loanNo.toLowerCase().includes(q) || l.borrowerName.toLowerCase().includes(q)),
    )
  }, [all, status, query])

  const open = all.filter((l) => l.status === 'active')
  const outstanding = open.reduce((s, l) => s + l.balance, 0)
  const released = all.filter((l) => l.status !== 'for_release').reduce((s, l) => s + l.principal, 0)
  const pastDue = open.filter((l) => l.pastDue)

  return (
    <>
      <PageHeader
        title={staffView ? 'Loans' : 'My Loans'}
        subtitle={staffView
          ? 'Approved Mutual Assistance loans: releases, payments and balances.'
          : 'Your Mutual Assistance loans, payments and balances.'}
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> {staffView ? 'New application' : 'Apply for a loan'}</Link>}
      />

      {!staffView && !session?.memberId && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          Your account isn't linked to a member record yet, so no loans are shown. Ask the UDEI office to link it.
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Open loans" value={String(open.length + carriedOpen)}
          hint={carriedOpen ? `${carriedOpen} carried over from the ledger` : `${all.filter((l) => l.status === 'for_release').length} waiting for release`} />
        <StatCard icon={Wallet} label="Outstanding balance" value={formatCentavos(outstanding + carriedTotal)}
          hint={carriedTotal ? `${formatCentavos(carriedTotal)} carried over` : undefined} />
        <StatCard icon={TrendingUp} label="Total released" value={formatCentavos(released)} />
        <StatCard icon={AlertTriangle} label="Past due" value={String(pastDue.length)} hint="Needs follow-up" />
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="card min-w-0">
        <div className="flex flex-col gap-3 border-b border-brand-100 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {statuses.map((s) => (
              <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  status === s ? 'bg-brand-800 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                }`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search loan no. or borrower" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search loans" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Borrower</th>
                <th className="px-4 py-3 text-right">Principal</th>
                <th className="px-4 py-3">Rate and term</th>
                <th className="px-4 py-3">Released</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="w-44 px-4 py-3">Paid</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {filtered.map((l) => (
                <tr key={l._id} className="cursor-pointer hover:bg-brand-50/50" onClick={() => navigate(`/loans/${l._id}`)}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/loans/${l._id}`} className="font-semibold text-ink hover:text-accent-dark" onClick={(e) => e.stopPropagation()}>
                      {l.loanNo}
                    </Link>
                    <p className="text-xs text-brand-500">{loanTypeLabel[l.loanType]}</p>
                  </td>
                  <td className="px-4 py-3">
                    {l.borrowerName}
                    {missedDeductionText(l) && <p className="text-xs whitespace-nowrap text-red-700">{missedDeductionText(l)}</p>}
                    {l.collectFrom?.source === 'final_pay' && <p className="text-xs font-semibold text-red-700">Separated from DNSC</p>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatCentavos(l.principal)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.monthlyRate}%/mo · {l.termMonths} mo</td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.release?.releasedAt ? formatDay(l.release.releasedAt) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{l.status === 'for_release' ? '—' : formatCentavos(l.balance)}</td>
                  <td className="px-4 py-3"><ProgressBar value={percent(l.amountPaid, l.totalPayable)} label={`${l.loanNo} paid`} /></td>
                  <td className="px-4 py-3"><StatusBadge status={displayStatus(l)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-brand-500">
                    {loans === null ? 'Loading loans…' : all.length === 0 ? 'No loans yet. A loan appears here once the President approves an application.' : 'No loans match this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {carried.length > 0 && (
        <div className="card mt-6 min-w-0">
          <div className="border-b border-brand-100 p-4">
            <h2 className="font-semibold text-ink">Carried over from the spreadsheet ledger</h2>
            <p className="text-sm text-brand-600">
              Yearly totals from UDEI's loan ledger as of {formatDay(carried[0].asOf)}. The ledger has no rates or schedules,
              so these are shown as balances only.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Start of year</th>
                  <th className="px-4 py-3 text-right">Borrowed this year</th>
                  <th className="px-4 py-3 text-right">Payments</th>
                  <th className="px-4 py-3 text-right">Interest</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {carriedShown.map((c) => (
                  <tr key={c.memberId}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-semibold text-ink">{c.fullName}</p>
                      {!c.fullName.startsWith('Member No.') && <p className="text-xs text-brand-500">{c.memberId}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCentavos(c.balanceStartOfYear)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCentavos(c.appliedThisYear)}
                      {c.loansThisYear > 0 && <p className="text-xs text-brand-500">{c.loansThisYear} {c.loansThisYear === 1 ? 'loan' : 'loans'}</p>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCentavos(c.payments)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatCentavos(c.interest)}</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCentavos(c.balance)}</td>
                    <td className="px-4 py-3 text-brand-600">{c.remarks || '—'}</td>
                  </tr>
                ))}
                {carriedShown.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-500">No carried-over balances match this search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
