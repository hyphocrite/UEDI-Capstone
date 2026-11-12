import { useState } from 'react'
import type { FormEvent } from 'react'
import { Banknote, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { useConfirm } from '../../context/ConfirmContext'
import { loanTypeLabel } from '../../lib/applications'
import { MANUAL_METHODS, formatCentavos, paymentMethodLabel, toCentavos, todayInput } from '../../lib/loans'
import type { Loan, OtherActiveLoan, Payment, PaymentMethod } from '../../lib/loans'

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/**
 * Treasurer only, while the loan is For release. The borrower's other active loans can be paid off
 * from the proceeds; loans of the same type (the usual renewal) start checked.
 */
export function ReleaseForm({ loan, otherLoans, onDone }: { loan: Loan; otherLoans: OtherActiveLoan[]; onDone: (loan: Loan) => void }) {
  const confirm = useConfirm()
  const [releasedAt, setReleasedAt] = useState(todayInput)
  const [voucherNo, setVoucherNo] = useState('')
  const [offset, setOffset] = useState(() => new Set(otherLoans.filter((o) => o.suggested).map((o) => o._id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const offsets = otherLoans.filter((o) => offset.has(o._id))
  const totalOffsets = offsets.reduce((s, o) => s + o.balance, 0)
  const net = loan.principal - totalOffsets

  const toggle = (id: string, on: boolean) =>
    setOffset((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!voucherNo.trim()) return setError('Enter the voucher number.')
    if (net < 0) return setError('The old balances are more than this loan. Deduct fewer loans.')
    const ok = await confirm({
      title: 'Release this loan?',
      message: (
        <>
          <p>Release <b>{loan.loanNo}</b> to <b>{loan.borrowerName}</b> under voucher <b>{voucherNo.trim()}</b>, dated {releasedAt}.</p>
          <p>Net proceeds: <b>{formatCentavos(net)}</b>{offsets.length ? `, after paying off ${offsets.map((o) => o.loanNo).join(', ')}` : ''}. The payment schedule starts from this date.</p>
        </>
      ),
      confirmLabel: 'Yes, release',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const r = await api<{ loan: Loan }>(`/api/loans/${loan._id}/release`, {
        method: 'POST',
        body: JSON.stringify({ releasedAt, voucherNo: voucherNo.trim(), offsetLoanIds: offsets.map((o) => o._id) }),
      })
      onDone(r.loan)
    } catch (err) {
      setError(errorText(err, 'Could not release the loan.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-semibold text-brand-800">Release loan</h2>
      {otherLoans.length > 0 && (
        <fieldset className="mt-3 rounded-lg bg-brand-50 p-3">
          <legend className="px-1 text-sm font-semibold text-brand-800">The borrower's other active loans</legend>
          <ul className="space-y-2">
            {otherLoans.map((o) => (
              <li key={o._id}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 shrink-0" checked={offset.has(o._id)} onChange={(e) => toggle(o._id, e.target.checked)} />
                  <span className="min-w-0">
                    Deduct from proceeds: <strong className="text-ink">{o.loanNo}</strong> ({loanTypeLabel[o.loanType]}), balance {formatCentavos(o.balance)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-brand-600">Each checked loan is paid off in full and closed when this loan is released.</p>
        </fieldset>
      )}
      <p className="mt-3 text-sm text-brand-600">
        Net proceeds: <strong className={net < 0 ? 'text-red-700' : 'text-ink'}>{formatCentavos(net)}</strong>
        {totalOffsets > 0 && <> ({formatCentavos(loan.principal)} less {formatCentavos(totalOffsets)} deducted)</>}. Releasing builds the
        repayment schedule.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="releasedAt">Release date</label>
          <input id="releasedAt" type="date" className="input" value={releasedAt} max={todayInput()} onChange={(e) => setReleasedAt(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="voucherNo">Voucher no.</label>
          <input id="voucherNo" className="input" maxLength={40} value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} placeholder="e.g. CV-2026-0142" />
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn-accent" disabled={busy || net < 0}><Send className="h-4 w-4" /> {busy ? 'Releasing…' : 'Release loan'}</button>
      </div>
    </form>
  )
}

/** Bookkeeper or Treasurer, while the loan is active. Amounts are typed in pesos and sent in centavos. */
export function PaymentForm({ loan, onDone }: { loan: Loan; onDone: (loan: Loan, payment: Payment) => void }) {
  const confirm = useConfirm()
  const [amount, setAmount] = useState(() => (loan.nextDue ? String(loan.nextDue.amount / 100) : ''))
  const [paidAt, setPaidAt] = useState(todayInput)
  const [method, setMethod] = useState<PaymentMethod>('payroll')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const centavos = toCentavos(amount)
    if (!(centavos > 0)) return setError('Enter the amount paid.')
    if (centavos > loan.balance) return setError(`That is more than the remaining balance of ${formatCentavos(loan.balance)}.`)
    const ok = await confirm({
      title: 'Record this payment?',
      message: <p>Record <b>{formatCentavos(centavos)}</b> ({paymentMethodLabel[method]}, paid {paidAt}) on <b>{loan.loanNo}</b> for {loan.borrowerName}. The balance goes down to {formatCentavos(loan.balance - centavos)}.</p>,
      confirmLabel: 'Yes, record it',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    setDone('')
    try {
      const r = await api<{ loan: Loan; payment: Payment }>(`/api/loans/${loan._id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: centavos, paidAt, method, reference: reference.trim() || undefined }),
      })
      onDone(r.loan, r.payment)
      setDone(`Recorded ${formatCentavos(centavos)}.`)
      setReference('')
      setAmount(r.loan.nextDue ? String(r.loan.nextDue.amount / 100) : '')
    } catch (err) {
      setError(errorText(err, 'Could not record the payment.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-semibold text-brand-800">Record payment</h2>
      <p className="mt-1 text-sm text-brand-600">
        Applied to the oldest unpaid installment first, interest before principal. Balance {formatCentavos(loan.balance)}.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label className="label" htmlFor="amount">Amount (₱)</label>
          <input id="amount" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="paidAt">Date paid</label>
          <input id="paidAt" type="date" className="input" value={paidAt} max={todayInput()} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="method">Method</label>
          <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {MANUAL_METHODS.map((m) => <option key={m} value={m}>{paymentMethodLabel[m]}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="reference">Reference</label>
          <input id="reference" className="input" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="OR no. or payroll period" />
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {done && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{done}</p>}
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn-accent" disabled={busy}><Banknote className="h-4 w-4" /> {busy ? 'Saving…' : 'Record payment'}</button>
      </div>
    </form>
  )
}
