import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { PaymentForm, ReleaseForm } from '../components/loans/LoanForms'
import PaymentHistory from '../components/loans/PaymentHistory'
import ScheduleTable from '../components/loans/ScheduleTable'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { loanTypeLabel } from '../lib/applications'
import { displayStatus, formatCentavos, formatDay } from '../lib/loans'
import type { Loan, Payment } from '../lib/loans'

export default function LoanDetailPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ loan: Loan; payments: Payment[] }>(`/api/loans/${id}`)
      .then((d) => {
        setLoan(d.loan)
        setPayments(d.payments)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the loan.'))
  }, [id])

  const back = (
    <Link to="/loans" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> All loans</Link>
  )

  if (!loan) {
    return (
      <>
        <PageHeader title="Loan" actions={back} />
        {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : <p className="text-sm text-brand-500">Loading…</p>}
      </>
    )
  }

  const role = session?.role
  const canRecord = role === 'bookkeeper' || role === 'treasurer'
  // Newest first, the same order the API returns.
  const withPayment = (p: Payment) => setPayments((list) => [p, ...list.filter((x) => x._id !== p._id)].sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.createdAt.localeCompare(a.createdAt)))

  return (
    <>
      <PageHeader
        title={loan.loanNo}
        subtitle={`${loan.borrowerName} · ${loanTypeLabel[loan.loanType]}${loan.applicationNo ? ` · from ${loan.applicationNo}` : ''}`}
        actions={back}
      />

      <section className="card mb-6 min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={displayStatus(loan)} />
          {loan.pastDue && <span className="text-sm font-semibold text-red-700">{formatCentavos(loan.pastDueAmount)} past due</span>}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Item label="Principal" value={formatCentavos(loan.principal)} />
          <Item label="Rate" value={`${loan.monthlyRate}% a month (add-on)`} />
          <Item label="Term" value={`${loan.termMonths} months, ${loan.paymentFrequency === 'quincenal' ? 'quincenal' : 'monthly'} deduction`} />
          <Item label="Total payable" value={loan.status === 'for_release' ? 'Set on release' : formatCentavos(loan.totalPayable)} />
          <Item label="Paid" value={formatCentavos(loan.amountPaid)} />
          <Item label="Balance" value={loan.status === 'for_release' ? '—' : formatCentavos(loan.balance)} strong />
          <Item label="Next due" value={loan.nextDue ? `${formatCentavos(loan.nextDue.amount)} on ${formatDay(loan.nextDue.dueDate)}` : '—'} />
          <Item
            label="Released"
            value={loan.release?.releasedAt
              ? `${formatDay(loan.release.releasedAt)}, voucher ${loan.release.voucherNo}${loan.release.releasedByName ? `, by ${loan.release.releasedByName}` : ''}`
              : 'Not yet'}
          />
          {loan.release?.netProceeds !== undefined && <Item label="Net proceeds" value={formatCentavos(loan.release.netProceeds)} />}
          {loan.existingBalances > 0 && <Item label="Existing balances deducted" value={formatCentavos(loan.existingBalances)} />}
        </dl>
      </section>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="space-y-6">
        {loan.status === 'for_release' &&
          (role === 'treasurer' ? (
            <ReleaseForm loan={loan} onDone={setLoan} />
          ) : (
            <p className="card p-4 text-sm text-brand-700 sm:p-5">Waiting for the Treasurer to release this loan.</p>
          ))}

        {loan.status === 'active' && canRecord && (
          <PaymentForm loan={loan} onDone={(l, p) => { setLoan(l); withPayment(p) }} />
        )}

        {loan.schedule.length > 0 && (
          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">Repayment schedule</h2>
            <ScheduleTable schedule={loan.schedule} />
          </section>
        )}

        {loan.status !== 'for_release' && (
          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">Payments</h2>
            <PaymentHistory loan={loan} payments={payments} canVoid={canRecord} onChange={(l, p) => { setLoan(l); withPayment(p) }} />
          </section>
        )}
      </div>
    </>
  )
}

function Item({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-brand-500">{label}</dt>
      <dd className={`break-words ${strong ? 'text-base font-bold text-ink' : 'font-semibold text-ink'}`}>{value}</dd>
    </div>
  )
}
