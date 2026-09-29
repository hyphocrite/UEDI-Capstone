import { useMemo, useState } from 'react'
import { AlertTriangle, HandCoins, Search, Wallet, TrendingUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import { loanBalance, loanTotalDue, loans, memberName } from '../data/mock'
import type { LoanStatus } from '../data/mock'
import { formatDate, formatPeso, percent } from '../lib/format'

const statuses: ('All' | LoanStatus)[] = ['All', 'Active', 'Past due', 'Pending', 'Fully paid']

export default function LoansPage() {
  const [status, setStatus] = useState<(typeof statuses)[number]>('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return loans.filter(
      (l) =>
        (status === 'All' || l.status === status) &&
        (!q || l.id.toLowerCase().includes(q) || memberName(l.memberId).toLowerCase().includes(q)),
    )
  }, [status, query])

  const open = loans.filter((l) => l.status === 'Active' || l.status === 'Past due')
  const outstanding = open.reduce((s, l) => s + loanBalance(l), 0)
  const released = loans.filter((l) => l.status !== 'Pending').reduce((s, l) => s + l.principal, 0)

  return (
    <>
      <PageHeader title="Loans" subtitle="Loan releases, payments and balances for every member." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Open loans" value={String(open.length)} />
        <StatCard icon={Wallet} label="Outstanding balance" value={formatPeso(outstanding)} />
        <StatCard icon={TrendingUp} label="Total released" value={formatPeso(released)} />
        <StatCard icon={AlertTriangle} label="Past due" value={String(loans.filter((l) => l.status === 'Past due').length)} hint="Needs follow-up" />
      </div>

      <div className="card">
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
            <input className="input pl-9" placeholder="Search loan ID or member" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search loans" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Loan</th>
                <th className="px-4 py-3">Member</th>
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
                <tr key={l.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{l.id}</p>
                    <p className="text-xs text-brand-500">{l.product}</p>
                  </td>
                  <td className="px-4 py-3">{memberName(l.memberId)}</td>
                  <td className="px-4 py-3 text-right">{formatPeso(l.principal)}</td>
                  <td className="px-4 py-3">{l.annualRate}% · {l.termMonths} mo</td>
                  <td className="px-4 py-3">{formatDate(l.releasedAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPeso(loanBalance(l))}</td>
                  <td className="px-4 py-3"><ProgressBar value={percent(l.amountPaid, loanTotalDue(l))} label={`${l.id} paid`} /></td>
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-brand-500">No loans match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
