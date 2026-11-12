import { useEffect, useState } from 'react'
import { Download, FileText, HandCoins, PiggyBank, TrendingUp, Wallet } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { api } from '../lib/api'
import { formatCentavos } from '../lib/loans'

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** One period's totals from GET /api/reports. Amounts in centavos. */
type Row = {
  label: string
  loansReleased: number
  newLoans: number
  loanCollections: number
  planContributions: number
  monthlyDues: number
  applications: number
  approved: number
  denied: number
}
type Report = { period: Period; from: string; to: string; generatedAt: string; rows: Row[] }

const periods: { id: Period; label: string; caption: string }[] = [
  { id: 'daily', label: 'Daily', caption: 'Last 14 days' },
  { id: 'weekly', label: 'Weekly', caption: 'Last 12 weeks' },
  { id: 'monthly', label: 'Monthly', caption: 'This year, by month' },
  { id: 'yearly', label: 'Yearly', caption: 'Last 6 years' },
]

type Money = 'loansReleased' | 'loanCollections' | 'planContributions' | 'monthlyDues'
type Count = 'newLoans' | 'applications' | 'approved' | 'denied'
const sum = (rows: Row[], k: Money | Count) => rows.reduce((s, r) => s + r[k], 0)
const short = (c: number) => formatCentavos(c).replace(/\.00$/, '')
const pesos = (c: number) => (c / 100).toFixed(2)

function toCsv(rows: Row[]) {
  const head = 'Period,Loans released (PHP),New loans,Loan collections (PHP),Retirement contributions (PHP),Monthly dues (PHP),Applications,Approved,Denied'
  const line = (r: Row) => [`"${r.label}"`, pesos(r.loansReleased), r.newLoans, pesos(r.loanCollections), pesos(r.planContributions), pesos(r.monthlyDues), r.applications, r.approved, r.denied].join(',')
  // The byte-order mark makes Excel read the peso sign and accents correctly.
  return '﻿' + [head, ...rows.map(line)].join('\r\n')
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('monthly')
  const [result, setResult] = useState<{ period: Period; report?: Report; error?: string } | null>(null)

  useEffect(() => {
    let live = true
    api<Report>(`/api/reports?period=${period}`)
      .then((report) => live && setResult({ period, report }))
      .catch((err: unknown) => live && setResult({ period, error: err instanceof Error ? err.message : 'Could not load the report.' }))
    return () => {
      live = false
    }
  }, [period])
  // Nothing shows for the old period while the new one loads.
  const current = result?.period === period ? result : null
  const report = current?.report ?? null
  const error = current?.error ?? ''

  const rows = report?.rows ?? []
  const caption = periods.find((p) => p.id === period)!.caption

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `udei-${period}-report-${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="hidden print:block">
        <p className="text-lg font-bold">United DNSC Employees, Inc.</p>
        <p className="text-sm">{periods.find((p) => p.id === period)!.label} report · {caption} · {report ? `generated ${new Date(report.generatedAt).toLocaleString('en-PH')}` : ''}</p>
      </div>
      <PageHeader
        title="Reports"
        subtitle="Loans released and collected, retirement contributions and applications, from UDEI's records."
        actions={
          <div className="flex gap-2 print:hidden">
            <button className="btn-ghost" onClick={download} disabled={!report}><Download className="h-4 w-4" /> Excel (CSV)</button>
            <button className="btn-ghost" onClick={() => window.print()} disabled={!report}><FileText className="h-4 w-4" /> Print or PDF</button>
          </div>
        }
      />

      <div className="mb-6 inline-flex rounded-lg border border-brand-200 bg-white p-1 print:hidden" role="tablist" aria-label="Report period">
        {periods.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${period === p.id ? 'bg-brand-800 text-white' : 'text-brand-700 hover:bg-brand-50'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={HandCoins} label="Loans released" value={report ? short(sum(rows, 'loansReleased')) : '…'} hint={`${sum(rows, 'newLoans')} loans · ${caption}`} />
        <StatCard icon={Wallet} label="Loan collections" value={report ? short(sum(rows, 'loanCollections')) : '…'} hint={caption} />
        <StatCard icon={PiggyBank} label="Retirement contributions" value={report ? short(sum(rows, 'planContributions')) : '…'} hint={`plus ${short(sum(rows, 'monthlyDues'))} in dues`} />
        <StatCard icon={TrendingUp} label="Applications" value={report ? String(sum(rows, 'applications')) : '…'} hint={`${sum(rows, 'approved')} approved, ${sum(rows, 'denied')} denied`} />
      </div>

      <div className="card mb-6 p-5 print:break-inside-avoid">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand-800">Money in by period</h2>
          <div className="flex gap-4 text-xs text-brand-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-800" /> Loan collections</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Retirement contributions and dues</span>
          </div>
        </div>
        {report ? <CollectionsChart rows={rows} /> : <div className="h-56" />}
      </div>

      <div className="card min-w-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Loans released</th>
              <th className="px-4 py-3 text-right">Loan collections</th>
              <th className="px-4 py-3 text-right">Retirement contributions</th>
              <th className="px-4 py-3 text-right">Dues</th>
              <th className="px-4 py-3 text-right">Applications</th>
              <th className="px-4 py-3 text-right">Approved / denied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {[...rows].reverse().map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 text-right">{short(r.loansReleased)}{r.newLoans > 0 && <span className="text-xs text-brand-500"> ({r.newLoans})</span>}</td>
                <td className="px-4 py-2.5 text-right">{short(r.loanCollections)}</td>
                <td className="px-4 py-2.5 text-right">{short(r.planContributions)}</td>
                <td className="px-4 py-2.5 text-right">{short(r.monthlyDues)}</td>
                <td className="px-4 py-2.5 text-right">{r.applications}</td>
                <td className="px-4 py-2.5 text-right">{r.approved} / {r.denied}</td>
              </tr>
            ))}
            {report && (
              <tr className="bg-brand-50 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right">{short(sum(rows, 'loansReleased'))}</td>
                <td className="px-4 py-2.5 text-right">{short(sum(rows, 'loanCollections'))}</td>
                <td className="px-4 py-2.5 text-right">{short(sum(rows, 'planContributions'))}</td>
                <td className="px-4 py-2.5 text-right">{short(sum(rows, 'monthlyDues'))}</td>
                <td className="px-4 py-2.5 text-right">{sum(rows, 'applications')}</td>
                <td className="px-4 py-2.5 text-right">{sum(rows, 'approved')} / {sum(rows, 'denied')}</td>
              </tr>
            )}
            {!report && !error && <tr><td colSpan={7} className="px-4 py-10 text-center text-brand-500">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-brand-500">
        Includes loans and payments recorded in the system and those imported from UDEI's 2026 ledger. Payments made by
        offsetting an old loan against a new one are not counted as collections.
      </p>
    </>
  )
}

function CollectionsChart({ rows }: { rows: Row[] }) {
  const total = (r: Row) => r.loanCollections + r.planContributions + r.monthlyDues
  const max = Math.max(...rows.map(total), 1)
  return (
    <div className="flex h-56 items-end gap-1.5 sm:gap-3">
      {rows.map((r) => {
        const t = total(r)
        return (
          <div key={r.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(t / max) * 100}%` }}
              title={`${r.label}: ${short(t)}`}>
              <div className="bg-brand-800" style={{ height: `${t ? (r.loanCollections / t) * 100 : 0}%` }} />
              <div className="bg-accent" style={{ height: `${t ? ((r.planContributions + r.monthlyDues) / t) * 100 : 0}%` }} />
            </div>
            <span className="w-full truncate text-center text-[10px] text-brand-600 sm:text-xs">{r.label.replace(/^Week of /, '')}</span>
          </div>
        )
      })}
    </div>
  )
}
