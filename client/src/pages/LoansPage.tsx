import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, FilePlus2, HandCoins, Search, Wallet, TrendingUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import { api } from '../lib/api'
import { loanTypeLabel } from '../lib/applications'
import { percent } from '../lib/format'
import { displayStatus, formatCentavos, formatDay } from '../lib/loans'
import type { Loan, LoanDisplayStatus } from '../lib/loans'

const statuses: ('All' | LoanDisplayStatus)[] = ['All', 'For release', 'Active', 'Past due', 'Fully paid']

export default function LoansPage() {
  const navigate = useNavigate()
  const [loans, setLoans] = useState<Loan[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<(typeof statuses)[number]>('All')
  const [query, setQuery] = useState('')

  useEffect(() => {
    api<{ loans: Loan[] }>('/api/loans')
      .then((d) => setLoans(d.loans))
      .catch((err: unknown) => {
        setLoans([])
        setError(err instanceof Error ? err.message : 'Could not load loans.')
      })
  }, [])

  const all = useMemo(() => loans ?? [], [loans])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(
      (l) =>
        (status === 'All' || displayStatus(l) === status) &&
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
        title="Loans"
        subtitle="Approved Mutual Assistance loans: releases, payments and balances."
        actions={<Link to="/loans/apply" className="btn-primary"><FilePlus2 className="h-4 w-4" /> New application</Link>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Open loans" value={String(open.length)} hint={`${all.filter((l) => l.status === 'for_release').length} waiting for release`} />
        <StatCard icon={Wallet} label="Outstanding balance" value={formatCentavos(outstanding)} />
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
                  <td className="px-4 py-3">{l.borrowerName}</td>
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
    </>
  )
}
