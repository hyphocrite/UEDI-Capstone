import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, FilePlus2, HandCoins, Search, Wallet, TrendingUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import Pagination from '../components/Pagination'
import TableShell from '../components/TableShell'
import { usePaged } from '../lib/usePaged'
import MyApplications from '../components/loans/MyApplications'
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
  // ?status=Past%20due (from the dashboard) opens with that filter.
  const [params] = useSearchParams()
  const [status, setStatus] = useState<(typeof statuses)[number]>(() => statuses.find((s) => s === params.get('status')) ?? 'All')
  const [query, setQuery] = useState('')
  const [carried, setCarried] = useState<Carried[]>([])

  useEffect(() => {
    api<{ loans: Loan[] }>('/api/loans')
      .then((d) => setLoans(d.loans))
      .catch((err: unknown) => {
        setLoans([])
        setError(err instanceof Error ? err.message : 'Could not load mutual assistance.')
      })
    api<{ carried: Carried[] }>('/api/loans/carried')
      .then((d) => setCarried(d.carried))
      .catch(() => setCarried([]))
  }, [])

  const carriedShown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return carried.filter((c) => !q || c.memberId.toLowerCase().includes(q) || c.fullName.toLowerCase().includes(q))
  }, [carried, query])
  // A negative ledger balance is an overpayment; it doesn't reduce what others owe (as on the Members page).
  const carriedTotal = carried.reduce((s, c) => s + Math.max(0, c.balance), 0)
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

  const paged = usePaged(filtered, { urlParam: 'page', resetKey: [status, query] })
  const carriedPaged = usePaged(carriedShown, { urlParam: 'carriedPage', resetKey: query })

  const open = all.filter((l) => l.status === 'active')
  const outstanding = open.reduce((s, l) => s + l.balance, 0)
  // Ledger loans are old balances, not money released by this system.
  const released = all.filter((l) => l.status !== 'for_release' && l.source !== 'ledger').reduce((s, l) => s + l.principal, 0)
  const pastDue = open.filter((l) => l.pastDue)

  return (
    <>
      <PageHeader icon={HandCoins}
        title={staffView ? 'Mutual Assistance' : 'My Mutual Assistance'}
        subtitle={staffView
          ? 'Approved mutual assistance (loans): releases, payments and balances.'
          : 'Your mutual assistance (loans), payments and balances.'}
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> {staffView ? 'New application' : 'Apply for mutual assistance'}</Link>}
      />

      {!staffView && !session?.memberId && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          Your account isn't linked to a member record yet, so no mutual assistance is shown. Ask the UDEI office to link it.
        </p>
      )}

      {!staffView && <MyApplications />}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Open mutual assistance" value={String(open.length + carriedOpen)}
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
                  status === s ? 'bg-brand-800 bg-grad-brand text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                }`}>
                {s}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search MA no. or borrower" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search mutual assistance" />
          </div>
        </div>

        <TableShell caption="Mutual assistance" anchor={paged.anchor}
          footer={<Pagination page={paged.page} pageSize={paged.perPage} total={paged.total} onPage={paged.setPage} />}>
            <thead className="table-head">
              <tr>
                <th>Mutual Assistance</th>
                <th>Borrower</th>
                <th className="text-right">Principal</th>
                <th>Rate and term</th>
                <th>Released</th>
                <th className="text-right">Balance</th>
                <th className="w-44">Paid</th>
                <th className="w-32">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {paged.pageRows.map((l) => (
                <tr key={l._id} className="row-hover cursor-pointer" onClick={() => navigate(`/loans/${l._id}`)}>
                  <td className="cell whitespace-nowrap">
                    <Link to={`/loans/${l._id}`} className="font-semibold text-ink hover:text-accent-dark" onClick={(e) => e.stopPropagation()}>
                      {l.loanNo}
                    </Link>
                    <p className="text-xs text-brand-500">{l.source === 'ledger' ? 'Carried over from the ledger' : loanTypeLabel[l.loanType]}{l.paymentModeLabel ? ` · ${l.paymentModeLabel}` : ''}</p>
                  </td>
                  <td className="cell">
                    <span className="line-clamp-2">{l.borrowerName}</span>
                    {missedDeductionText(l) && <p className="text-xs whitespace-nowrap text-red-700">{missedDeductionText(l)}</p>}
                    {l.collectFrom?.source === 'final_pay' && <p className="text-xs font-semibold text-red-700">Separated from DNSC</p>}
                  </td>
                  <td className="cell-num">{formatCentavos(l.principal)}</td>
                  <td className="cell whitespace-nowrap">{l.monthlyRate}% per month · {l.termMonths} months</td>
                  <td className="cell whitespace-nowrap">{l.release?.releasedAt ? formatDay(l.release.releasedAt) : '—'}</td>
                  <td className="cell-num font-semibold">{l.status === 'for_release' ? '—' : formatCentavos(l.balance)}</td>
                  <td className="cell"><ProgressBar value={percent(l.amountPaid, l.totalPayable)} label={`${l.loanNo} paid`} /></td>
                  <td className="cell whitespace-nowrap"><StatusBadge status={displayStatus(l)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-brand-500">
                    {loans === null ? 'Loading mutual assistance…' : all.length === 0 ? 'No mutual assistance yet. A mutual assistance appears here once the President approves an application.' : 'No mutual assistance matches this filter.'}
                  </td>
                </tr>
              )}
            </tbody>
        </TableShell>
      </div>

      {carried.length > 0 && (
        <div className="card mt-6 min-w-0">
          <div className="border-b border-brand-100 p-4">
            <h2 className="font-semibold text-ink">Carried over from the spreadsheet ledger</h2>
            <p className="text-sm text-brand-600">
              Yearly totals from UDEI's mutual assistance ledger as of {formatDay(carried[0].asOf)}. The ledger has no rates or schedules,
              so these are balances only. Once the Bookkeeper sets a member's payroll deduction on the Members page, the
              balance moves to the list above and payroll deduction runs include it.
            </p>
          </div>
          <TableShell caption="Carried over from the spreadsheet ledger" anchor={carriedPaged.anchor}
            footer={<Pagination page={carriedPaged.page} pageSize={carriedPaged.perPage} total={carriedPaged.total} onPage={carriedPaged.setPage} />}>
              <thead className="table-head">
                <tr>
                  <th>Member</th>
                  <th className="text-right">Start of year</th>
                  <th className="text-right">Borrowed this year</th>
                  <th className="text-right">Payments</th>
                  <th className="text-right">Interest</th>
                  <th className="text-right">Balance</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {carriedPaged.pageRows.map((c) => (
                  <tr key={c.memberId} className="row-hover">
                    <td className="cell">
                      <p className="line-clamp-2 font-semibold text-ink">{c.fullName}</p>
                      {!c.fullName.startsWith('Member No.') && <p className="text-xs text-brand-500">{c.memberId}</p>}
                    </td>
                    <td className="cell-num">{formatCentavos(c.balanceStartOfYear)}</td>
                    <td className="cell-num">
                      {formatCentavos(c.appliedThisYear)}
                      {c.loansThisYear > 0 && <p className="text-xs text-brand-500">{c.loansThisYear} mutual assistance</p>}
                    </td>
                    <td className="cell-num">{formatCentavos(c.payments)}</td>
                    <td className="cell-num">{formatCentavos(c.interest)}</td>
                    <td className="cell-num font-semibold">{formatCentavos(c.balance)}</td>
                    <td className="cell text-brand-600"><p className="max-w-[16rem] truncate" title={c.remarks || undefined}>{c.remarks || '—'}</p></td>
                  </tr>
                ))}
                {carriedShown.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-500">No carried-over balances match this search.</td></tr>
                )}
              </tbody>
          </TableShell>
        </div>
      )}
    </>
  )
}
