import { useState } from 'react'
import type { FormEvent } from 'react'
import { Banknote, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { formatCentavos, paymentMethodLabel, toCentavos, todayInput } from '../../lib/loans'
import type { Loan, Payment, PaymentMethod } from '../../lib/loans'

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** Treasurer only, while the loan is For release. */
export function ReleaseForm({ loan, onDone }: { loan: Loan; onDone: (loan: Loan) => void }) {
  const [releasedAt, setReleasedAt] = useState(todayInput)
  const [voucherNo, setVoucherNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const net = loan.principal - loan.existingBalances

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!voucherNo.trim()) return setError('Enter the voucher number.')
    setBusy(true)
    setError('')
    try {
      const r = await api<{ loan: Loan }>(`/api/loans/${loan._id}/release`, {
        method: 'POST',
        body: JSON.stringify({ releasedAt, voucherNo: voucherNo.trim() }),
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
      <p className="mt-1 text-sm text-brand-600">
        Net proceeds: <strong className={net < 0 ? 'text-red-700' : 'text-ink'}>{formatCentavos(net)}</strong> ({formatCentavos(loan.principal)} less{' '}
        {formatCentavos(loan.existingBalances)} existing balances from the Bookkeeper). Releasing builds the repayment schedule.
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
        <button type="submit" className="btn-accent" disabled={busy}><Send className="h-4 w-4" /> {busy ? 'Releasing…' : 'Release loan'}</button>
      </div>
    </form>
  )
}

/** Bookkeeper or Treasurer, while the loan is active. Amounts are typed in pesos and sent in centavos. */
export function PaymentForm({ loan, onDone }: { loan: Loan; onDone: (loan: Loan, payment: Payment) => void }) {
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
            {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((m) => <option key={m} value={m}>{paymentMethodLabel[m]}</option>)}
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
