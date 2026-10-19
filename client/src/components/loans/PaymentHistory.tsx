import { useState } from 'react'
import { Ban } from 'lucide-react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { formatCentavos, formatDay, paymentMethodLabel } from '../../lib/loans'
import type { Loan, Payment } from '../../lib/loans'

type Props = {
  loan: Loan
  payments: Payment[]
  canVoid: boolean
  onChange: (loan: Loan, payment: Payment) => void
}

/** Payments, newest first. Voided ones stay listed, struck through, with the reason. */
export default function PaymentHistory({ loan, payments, canVoid, onChange }: Props) {
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => {
    setVoiding(null)
    setReason('')
    setError('')
  }

  const confirmVoid = async () => {
    if (!voiding) return
    if (reason.trim().length < 3) return setError('Give a reason for voiding this payment.')
    setBusy(true)
    setError('')
    try {
      const r = await api<{ loan: Loan; payment: Payment }>(`/api/loans/${loan._id}/payments/${voiding._id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      onChange(r.loan, r.payment)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void the payment.')
    } finally {
      setBusy(false)
    }
  }

  if (payments.length === 0) return <p className="px-4 py-6 text-sm text-brand-500 sm:px-5">No payments recorded yet.</p>

  return (
    <>
      <ul className="divide-y divide-brand-50">
        {payments.map((p) => (
          <li key={p._id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div className={`min-w-0 ${p.voided ? 'text-brand-400' : ''}`}>
              <p className={`font-semibold ${p.voided ? 'line-through' : 'text-ink'}`}>
                {formatCentavos(p.amount)} <span className="font-normal">on {formatDay(p.paidAt)}</span>
              </p>
              <p className={`text-xs ${p.voided ? 'line-through' : 'text-brand-600'}`}>
                {paymentMethodLabel[p.method]}
                {p.reference && ` · ${p.reference}`}
                {p.recordedByName && ` · recorded by ${p.recordedByName}`}
              </p>
              {p.voided && (
                <p className="mt-1 text-xs break-words text-red-700">
                  Voided{p.voidedByName && ` by ${p.voidedByName}`}{p.voidedAt && ` on ${formatDay(p.voidedAt)}`}: {p.voidReason}
                </p>
              )}
            </div>
            {canVoid && !p.voided && (
              <button type="button" className="btn-ghost shrink-0 self-start px-3 text-red-700" onClick={() => setVoiding(p)}>
                <Ban className="h-4 w-4" /> Void
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal title="Void this payment?" open={voiding !== null} onClose={close}>
        {voiding && (
          <>
            <p className="text-sm text-brand-700">
              {formatCentavos(voiding.amount)} paid on {formatDay(voiding.paidAt)}. The payment stays on record, marked void, and the
              schedule is worked out again without it.
            </p>
            <label className="label mt-4" htmlFor="voidReason">Reason</label>
            <textarea id="voidReason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Entered twice; the payroll file had one deduction." />
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
              <button type="button" className="btn border border-red-200 bg-red-600 text-white hover:bg-red-700" onClick={confirmVoid} disabled={busy}>
                {busy ? 'Voiding…' : 'Void payment'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
