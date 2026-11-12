import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import { api } from '../lib/api'
import { loanTypeLabel } from '../lib/applications'
import { formatCentavos, formatDay, paymentMethodLabel, todayKey } from '../lib/loans'
import type { Loan, Payment } from '../lib/loans'

/**
 * Statement of account for one loan, laid out for printing: Print or PDF saves it as a PDF.
 * Members can open their own; staff any (the API decides).
 */
export default function StatementPage() {
  const { id } = useParams()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ loan: Loan; payments: Payment[] }>(`/api/loans/${id}`)
      .then((d) => {
        setLoan(d.loan)
        setPayments(d.payments.filter((p) => !p.voided).sort((a, b) => a.paidAt.localeCompare(b.paidAt)))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the loan.'))
  }, [id])

  // Name the PDF after the loan and date when it is saved.
  useEffect(() => {
    if (!loan) return
    const before = document.title
    document.title = `Statement of Account ${loan.loanNo} ${todayKey()}`
    return () => {
      document.title = before
    }
  }, [loan])

  if (!loan) {
    return error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : <p className="text-sm text-brand-500">Loading…</p>
  }

  const today = todayKey()
  const due = loan.schedule.filter((s) => s.dueDate.slice(0, 10) <= today)
  const dueToDate = due.reduce((s, x) => s + x.totalDue, 0)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap justify-between gap-2 print:hidden">
        <Link to={`/loans/${loan._id}`} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back to {loan.loanNo}</Link>
        <button className="btn-primary" onClick={() => window.print()}><FileText className="h-4 w-4" /> Print or save as PDF</button>
      </div>

      <article className="card p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-100 pb-4">
          <div>
            <BrandLogo />
            <p className="mt-1 text-xs text-brand-600">United DNSC Employees, Inc. · Mutual Assistance</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-brand-800">Statement of Account</h1>
            <p className="text-sm text-brand-600">As of {formatDay(today)}</p>
          </div>
        </header>

        <section className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Borrower" value={loan.borrowerName} />
          <Row label="Member no." value={loan.memberId || '—'} />
          <Row label="Loan no." value={loan.loanNo} />
          <Row label="Loan type" value={loan.source === 'ledger' ? 'Balance carried over from the ledger' : loanTypeLabel[loan.loanType]} />
          <Row label="Principal" value={formatCentavos(loan.principal)} />
          <Row label="Rate and term" value={`${loan.monthlyRate}% a month · ${loan.termMonths} months`} />
          <Row label="Deducted" value={loan.paymentFrequency === 'quincenal' ? 'Every payday (15th and month-end)' : 'Monthly (month-end)'} />
          <Row label="Released" value={loan.release?.releasedAt ? formatDay(loan.release.releasedAt) : 'Not yet released'} />
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:break-inside-avoid">
          <Box label="Total payable" value={formatCentavos(loan.totalPayable)} />
          <Box label="Paid so far" value={formatCentavos(loan.amountPaid)} />
          <Box label="Balance" value={formatCentavos(loan.balance)} strong />
          <Box label={loan.pastDue ? 'Past due' : 'Next due'} value={loan.pastDue ? formatCentavos(loan.pastDueAmount) : loan.nextDue ? `${formatCentavos(loan.nextDue.amount)} on ${formatDay(loan.nextDue.dueDate)}` : '—'} warn={loan.pastDue} />
        </section>
        <p className="mt-2 text-xs text-brand-500">Due up to today: {formatCentavos(dueToDate)} over {due.length} installments.</p>

        <h2 className="mt-6 mb-2 font-semibold text-brand-800">Payments received</h2>
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">How</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {payments.map((p) => (
              <tr key={p._id}>
                <td className="px-3 py-1.5 whitespace-nowrap">{formatDay(p.paidAt)}</td>
                <td className="px-3 py-1.5">{paymentMethodLabel[p.method]}</td>
                <td className="px-3 py-1.5">{p.reference || '—'}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCentavos(p.amount)}</td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-brand-500">No payments yet.</td></tr>}
          </tbody>
        </table>

        <h2 className="mt-6 mb-2 font-semibold text-brand-800">Payment schedule</h2>
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">No.</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Principal</th>
              <th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Amount due</th>
              <th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {loan.schedule.map((s) => {
              const late = s.paid < s.totalDue && s.dueDate.slice(0, 10) < today
              return (
                <tr key={s.no} className="print:break-inside-avoid">
                  <td className="px-3 py-1.5">{s.no}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatDay(s.dueDate)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCentavos(s.principalDue)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCentavos(s.interestDue)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCentavos(s.totalDue)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCentavos(s.paid)}</td>
                  <td className={`px-3 py-1.5 whitespace-nowrap ${late ? 'font-semibold text-red-700' : 'text-brand-600'}`}>
                    {s.paid >= s.totalDue ? 'Paid' : late ? 'Past due' : s.paid > 0 ? 'Partly paid' : 'Not yet due'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <footer className="mt-8 border-t border-brand-100 pt-3 text-xs text-brand-500">
          Generated by the UDEI loan system on {formatDay(today)}. Amounts in Philippine pesos. Voided payments are not shown.
          Please report any difference to the UDEI office.
        </footer>
      </article>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-brand-50 py-1">
      <dt className="text-brand-600">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function Box({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${warn ? 'border-red-200 bg-red-50' : 'border-brand-100 bg-brand-50/50'}`}>
      <p className="text-xs text-brand-600">{label}</p>
      <p className={`mt-0.5 ${strong ? 'text-lg font-bold' : 'font-semibold'} ${warn ? 'text-red-700' : 'text-ink'}`}>{value}</p>
    </div>
  )
}
