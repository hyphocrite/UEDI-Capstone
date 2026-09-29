import { useMemo, useState } from 'react'
import { Download, HandCoins, PiggyBank, TrendingUp, Wallet } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { buildReport } from '../data/mock'
import type { ReportPeriod, ReportRow } from '../data/mock'
import { formatPeso } from '../lib/format'

const periods: { id: ReportPeriod; label: string; caption: string }[] = [
  { id: 'daily', label: 'Daily', caption: 'Last 14 days' },
  { id: 'monthly', label: 'Monthly', caption: 'This year, by month' },
  { id: 'yearly', label: 'Yearly', caption: 'Last 6 years' },
]

const sum = (rows: ReportRow[], k: keyof Omit<ReportRow, 'label'>) => rows.reduce((s, r) => s + r[k], 0)

function toCsv(rows: ReportRow[]) {
  const head = 'Period,Loans released,Loan collections,Plan payments,New loans,New plans'
  return [head, ...rows.map((r) => [r.label, r.loansReleased, r.loanCollections, r.planPayments, r.newLoans, r.newPlans].join(','))].join('\n')
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>('monthly')
  const rows = useMemo(() => buildReport(period), [period])
  const caption = periods.find((p) => p.id === period)!.caption

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `uedi-${period}-report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Loans and retirement plan payments, daily, monthly and yearly."
        actions={<button className="btn-ghost" onClick={download}><Download className="h-4 w-4" /> Download CSV</button>}
      />

      <div className="mb-6 inline-flex rounded-lg border border-brand-200 bg-white p-1" role="tablist" aria-label="Report period">
        {periods.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
              period === p.id ? 'bg-brand-800 text-white' : 'text-brand-700 hover:bg-brand-50'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Loans released" value={formatPeso(sum(rows, 'loansReleased'))} hint={caption} />
        <StatCard icon={Wallet} label="Loan collections" value={formatPeso(sum(rows, 'loanCollections'))} hint={caption} />
        <StatCard icon={PiggyBank} label="Plan payments" value={formatPeso(sum(rows, 'planPayments'))} hint={caption} />
        <StatCard icon={TrendingUp} label="New loans" value={String(sum(rows, 'newLoans'))} hint={`and ${sum(rows, 'newPlans')} new retirement plans`} />
      </div>

      <div className="card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand-800">Collections by period</h2>
          <div className="flex gap-4 text-xs text-brand-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-800" /> Loan collections</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Plan payments</span>
          </div>
        </div>
        <CollectionsChart rows={rows} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Loans released</th>
              <th className="px-4 py-3 text-right">Loan collections</th>
              <th className="px-4 py-3 text-right">Plan payments</th>
              <th className="px-4 py-3 text-right">New loans</th>
              <th className="px-4 py-3 text-right">New plans</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {[...rows].reverse().map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 text-right">{formatPeso(r.loansReleased)}</td>
                <td className="px-4 py-2.5 text-right">{formatPeso(r.loanCollections)}</td>
                <td className="px-4 py-2.5 text-right">{formatPeso(r.planPayments)}</td>
                <td className="px-4 py-2.5 text-right">{r.newLoans}</td>
                <td className="px-4 py-2.5 text-right">{r.newPlans}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-500">Sample figures. Reports will read from the database once loans and plans are recorded there.</p>
    </>
  )
}

function CollectionsChart({ rows }: { rows: ReportRow[] }) {
  const max = Math.max(...rows.map((r) => r.loanCollections + r.planPayments), 1)
  return (
    <div className="flex h-56 items-end gap-1.5 sm:gap-3">
      {rows.map((r) => {
        const total = r.loanCollections + r.planPayments
        return (
          <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md"
              style={{ height: `${(total / max) * 100}%` }}
              title={`${r.label}: ${formatPeso(total)}`}
            >
              <div className="bg-brand-800" style={{ height: `${(r.loanCollections / total) * 100}%` }} />
              <div className="bg-accent" style={{ height: `${(r.planPayments / total) * 100}%` }} />
            </div>
            <span className="w-full truncate text-center text-[10px] text-brand-600 sm:text-xs">{r.label}</span>
          </div>
        )
      })}
    </div>
  )
}
