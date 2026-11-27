import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HowItWorks from '../components/HowItWorks'
import { ArrowLeft, Banknote, FileText, HandCoins, Send } from 'lucide-react'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import SendPaymentForm from '../components/payments/SendPaymentForm'
import SubmissionList from '../components/payments/SubmissionList'
import PaymentModePanel from '../components/loans/PaymentModePanel'
import ConversionNote, { ConversionBadge } from '../components/loans/ConversionNote'
import LedgerExportButton from '../components/LedgerExportButton'
import StatusBadge from '../components/StatusBadge'
import { PaymentForm, ReleaseForm } from '../components/loans/LoanForms'
import PaymentHistory from '../components/loans/PaymentHistory'
import ScheduleTable from '../components/loans/ScheduleTable'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { atLeast } from '../lib/roles'
import type { PaymentSubmission } from '../lib/payments'
import { loanTypeLabel } from '../lib/applications'
import { displayStatus, formatCentavos, formatDay, missedDeductionText } from '../lib/loans'
import { modeLabel, frequencyLabel } from '../lib/paymentModes'
import type { Loan, OtherActiveLoan, Payment } from '../lib/loans'

export default function LoanDetailPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [otherLoans, setOtherLoans] = useState<OtherActiveLoan[]>([])
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState<PaymentSubmission[] | null>(null)
  const [sending, setSending] = useState(false)
  const [sentNote, setSentNote] = useState('')

  // The borrower sees their own submissions; the Bookkeeper, Treasurer and up see the loan's.
  const loadSubmissions = useCallback(() => {
    const staff = atLeast(session?.role, 'loan_officer')
    const path = staff ? `/api/payments?loan=${id}` : `/api/payments/mine?loan=${id}`
    api<{ submissions: PaymentSubmission[] }>(path)
      .then((d) => setSubmissions(d.submissions))
      .catch(() => setSubmissions(null))
  }, [id, session?.role])
  useEffect(loadSubmissions, [loadSubmissions])

  useEffect(() => {
    api<{ loan: Loan; payments: Payment[]; otherActiveLoans?: OtherActiveLoan[] }>(`/api/loans/${id}`)
      .then((d) => {
        setLoan(d.loan)
        setPayments(d.payments)
        setOtherLoans(d.otherActiveLoans ?? [])
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the mutual assistance.'))
  }, [id])

  const back = (
    <Link to="/loans" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back to mutual assistance</Link>
  )

  if (!loan) {
    return (
      <>
        <PageHeader icon={HandCoins} title="Mutual Assistance" actions={back} />
        {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : <p className="text-sm text-brand-500">Loading…</p>}
      </>
    )
  }

  const role = session?.role
  const canRecord = role === 'bookkeeper' || role === 'treasurer'
  // The borrower: members only ever see their own, and staff may have a loan of their own.
  const borrower = !atLeast(role, 'loan_officer') || (!!session?.memberId && session.memberId === loan.memberId)
  const ahead = loan.paidAhead && loan.paidAhead.amount > 0 ? loan.paidAhead : null
  const reload = () =>
    api<{ loan: Loan; payments: Payment[] }>(`/api/loans/${id}`).then((d) => {
      setLoan(d.loan)
      setPayments(d.payments)
    })
  const sent = (s: PaymentSubmission) => {
    setSending(false)
    setSentNote(`${formatCentavos(s.amount)} sent.`)
    loadSubmissions()
  }
  // Newest first, the same order the API returns.
  const withPayment = (p: Payment) => setPayments((list) => [p, ...list.filter((x) => x._id !== p._id)].sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.createdAt.localeCompare(a.createdAt)))

  // Staff: every figure. Members: under "More details" (Balance, Next due and Mode of payment are above).
  const moreDetails = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2 lg:grid-cols-4">
      <Item label="Principal" value={formatCentavos(loan.principal)} />
      <Item label="Rate" value={`${loan.monthlyRate}% per month on the remaining balance`} />
      <Item label="Term" value={loan.paymentMode === 'bonus' && loan.schedule.length === 1 ? `One payment on ${formatDay(loan.schedule[0].dueDate)}` : `${loan.termMonths} months, ${frequencyLabel(loan.paymentFrequency)}`} />
      {!borrower && <Item label="Mode of payment" value={loan.paymentModeLabel ?? modeLabel(loan.paymentMode, loan.bonusType)} />}
      <Item label="Total payable" value={loan.status === 'for_release' ? 'Set on release' : formatCentavos(loan.totalPayable)} />
      <Item label="Paid" value={formatCentavos(loan.amountPaid)} />
      {!borrower && <Item label="Balance" value={loan.status === 'for_release' ? '—' : formatCentavos(loan.balance)} strong />}
      {!borrower && <Item label="Next due" value={loan.nextDue ? `${formatCentavos(loan.nextDue.amount)} on ${formatDay(loan.nextDue.dueDate)}` : '—'} />}
      {!borrower && ahead && <Item label="Paid ahead" value={`${ahead.count} installment${ahead.count === 1 ? '' : 's'} (${formatCentavos(ahead.amount)})`} />}
      <Item
        label="Released"
        value={loan.release?.releasedAt
          ? `${formatDay(loan.release.releasedAt)}, voucher ${loan.release.voucherNo}${loan.release.releasedByName ? `, by ${loan.release.releasedByName}` : ''}`
          : 'Not yet'}
      />
      {loan.release?.netProceeds !== undefined && <Item label="Net proceeds" value={formatCentavos(loan.release.netProceeds)} />}
      {loan.release?.offsets?.map((o) => (
        <Item key={o.loanNo} label="Deducted from proceeds" value={`${formatCentavos(o.amount)} to close ${o.loanNo}`} />
      ))}
      {borrower && loan.applicationNo && <Item label="From application" value={loan.applicationNo} />}
    </dl>
  )

  return (
    <>
      <PageHeader icon={HandCoins}
        title={loan.loanNo}
        subtitle={`${loan.borrowerName} · ${loanTypeLabel[loan.loanType]}${loan.applicationNo && !borrower ? ` · from ${loan.applicationNo}` : ''}`}
        actions={
          <>
            {loan.status !== 'for_release' && (
              <Link to={`/loans/${loan._id}/statement`} className="btn-ghost"><FileText className="h-4 w-4" /> Statement of account</Link>
            )}
            {loan.memberId && loan.status !== 'for_release' && (session?.role === 'bookkeeper' || atLeast(session?.role, 'treasurer')) && (
              <LedgerExportButton memberId={loan.memberId} label="Download ledger (Excel)" />
            )}
            {back}
          </>
        }
      />

      {loan.collectFrom?.source === 'final_pay' && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">
          Separated from DNSC: collect from final pay or retirement plan.
          {loan.collectFrom.cutoffDate && <span className="font-normal"> Reported on the {formatDay(loan.collectFrom.cutoffDate)} payroll run.</span>}
        </p>
      )}
      {missedDeductionText(loan) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{missedDeductionText(loan)}.</p>
      )}

      <section className="card mb-6 min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={displayStatus(loan)} />
          <ConversionBadge loan={loan} />
          {loan.pastDue && <span className="text-sm font-semibold text-red-700">{formatCentavos(loan.pastDueAmount)} past due</span>}
        </div>
        {/* Members see what they need first; the rest is under "More details". Staff see everything. */}
        {borrower && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2 lg:grid-cols-4">
            <Item label="Balance" value={loan.status === 'for_release' ? '—' : formatCentavos(loan.balance)} strong />
            <Item label="Next due" value={loan.nextDue ? `${formatCentavos(loan.nextDue.amount)} on ${formatDay(loan.nextDue.dueDate)}` : '—'} />
            <Item label="Mode of payment" value={loan.paymentModeLabel ?? modeLabel(loan.paymentMode, loan.bonusType)} />
            {ahead && <Item label="Paid ahead" value={`${ahead.count} installment${ahead.count === 1 ? '' : 's'} (${formatCentavos(ahead.amount)})`} />}
          </dl>
        )}
        {borrower ? <HowItWorks label="More details" className="mt-4">{moreDetails}</HowItWorks> : moreDetails}
        {borrower && loan.status === 'active' && loan.finishesAround && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Your mutual assistance will finish around <b>{formatDay(loan.finishesAround)}</b> at the current deduction.
          </p>
        )}
      </section>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="space-y-6">
        {loan.status === 'for_release' &&
          (role === 'treasurer' ? (
            <ReleaseForm loan={loan} otherLoans={otherLoans} onDone={setLoan} />
          ) : (
            <p className="card p-4 text-sm text-brand-700 sm:p-5">Waiting for the Treasurer to release this mutual assistance.</p>
          ))}

        {loan.status !== 'for_release' && (
          <PaymentModePanel loan={loan} canChange={borrower || role === 'bookkeeper'} onChanged={setLoan} />
        )}

        {loan.status === 'active' && borrower && (
          <section className="card min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-brand-800">Pay ahead</h2>
                <p className="text-sm text-brand-600">Paid with GCash, Maya, a bank deposit or cash? Send it here with the reference and a photo of the receipt.</p>
              </div>
              <button type="button" className="btn-accent" onClick={() => { setSentNote(''); setSending(true) }}><Send className="h-4 w-4" /> Send a payment</button>
            </div>
            {sentNote && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{sentNote} You get an email once it is posted to your ledger.</p>}
          </section>
        )}

        {loan.status === 'active' && canRecord && !borrower && (
          <>
            <section className="card min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-brand-800">Cash, e-wallet or bank deposit / transfer</h2>
                  <p className="text-sm text-brand-600">Walk-in payments go to the Payments page: the Treasurer issues the OR, then the Bookkeeper confirms and posts it.</p>
                </div>
                <button type="button" className="btn-ghost" onClick={() => { setSentNote(''); setSending(true) }}><Banknote className="h-4 w-4" /> Record walk-in payment</button>
              </div>
              {sentNote && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{sentNote} <Link to="/payments" className="font-semibold underline">Open Payments</Link></p>}
            </section>
            <PaymentForm loan={loan} onDone={(l, p) => { setLoan(l); withPayment(p) }} />
          </>
        )}

        <Modal title={borrower ? 'Send a payment' : 'Record walk-in payment'} open={sending} onClose={() => setSending(false)}>
          <SendPaymentForm loan={loan} office={!borrower} onSent={sent} onCancel={() => setSending(false)} />
        </Modal>

        <ConversionNote loan={loan} />

        {loan.schedule.length > 0 && (
          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">Payment schedule</h2>
            <ScheduleTable schedule={loan.schedule} />
          </section>
        )}

        {loan.status !== 'for_release' && (!borrower || payments.length > 0) && (
          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">Payments received</h2>
            <PaymentHistory loan={loan} payments={payments} canVoid={canRecord} onChange={(l, p) => { setLoan(l); withPayment(p); loadSubmissions() }} />
          </section>
        )}

        {loan.status !== 'for_release' && submissions && submissions.length > 0 && (
          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">
              {borrower ? 'Payments you sent' : 'Payments sent for review'}
            </h2>
            <SubmissionList submissions={submissions} staff={!borrower} onChange={() => { loadSubmissions(); void reload() }} />
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
