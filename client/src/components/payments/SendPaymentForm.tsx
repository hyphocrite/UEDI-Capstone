import { useState } from 'react'
import type { FormEvent } from 'react'
import { Info, Send } from 'lucide-react'
import { api } from '../../lib/api'
import { formatCentavos, toCentavos, todayInput } from '../../lib/loans'
import type { Loan } from '../../lib/loans'
import { ADVANCE_NOTE, PROOF_ACCEPT, SUBMISSION_METHODS, uploadProof } from '../../lib/payments'
import type { PaymentSubmission, SubmissionMethod } from '../../lib/payments'

/**
 * A member reports a payment made outside payroll: e-money, bank transfer or cash at the office.
 * The proof photo is uploaded right after; the Treasurer then issues the OR and the Bookkeeper posts it.
 * The office uses the same form for walk-in payments (`office`), where proof is optional.
 */
export default function SendPaymentForm({ loan, office = false, onSent, onCancel }: {
  loan: Loan
  office?: boolean
  onSent: (s: PaymentSubmission) => void
  onCancel?: () => void
}) {
  const [method, setMethod] = useState<SubmissionMethod>(office ? 'cash' : 'e_money')
  const [amount, setAmount] = useState(() => (loan.nextDue ? String(loan.nextDue.amount / 100) : ''))
  const [paidAt, setPaidAt] = useState(todayInput)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsReference = method !== 'cash'
  const needsProof = !office && method !== 'cash'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const centavos = toCentavos(amount)
    if (!(centavos > 0)) return setError('Enter the amount paid.')
    if (centavos > loan.balance) return setError(`That is more than the remaining balance of ${formatCentavos(loan.balance)}.`)
    if (needsReference && !reference.trim()) return setError(`Enter the ${method === 'e_money' ? 'e-money' : 'bank'} reference number.`)
    if (needsProof && !proof) return setError('Add a photo or screenshot of the receipt or transfer.')
    setBusy(true)
    setError('')
    try {
      let { submission } = await api<{ submission: PaymentSubmission }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ loanId: loan._id, amount: centavos, method, paidAt, reference: reference.trim() || undefined, note: note.trim() || undefined }),
      })
      if (proof) {
        try {
          submission = await uploadProof(submission._id, proof)
        } catch (err) {
          // The payment was sent; only the photo failed. Say so rather than sending it twice.
          onSent(submission)
          throw new Error(`The payment was sent, but the proof didn't upload: ${err instanceof Error ? err.message : 'try again'}. Add it from the list below.`)
        }
      }
      onSent(submission)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="min-w-0">
      <p className="flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {office ? 'Payroll deduction keeps running at the same amount. This is an advance payment.' : ADVANCE_NOTE}{' '}
          {office
            ? 'It goes to the Payments page: the Treasurer issues the OR, then the Bookkeeper confirms and posts it.'
            : 'The Treasurer checks it and issues an Official Receipt, then the Bookkeeper posts it to your ledger.'}
        </span>
      </p>

      <fieldset className="mt-4">
        <legend className="label">Method</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SUBMISSION_METHODS.map((m) => (
            <label key={m.value} className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${method === m.value ? 'border-brand-600 bg-brand-50' : 'border-brand-200'}`}>
              <span className="flex items-center gap-2 font-semibold text-ink">
                <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} />
                {m.label}
              </span>
              <span className="text-xs text-brand-600">{m.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="sp-amount">Amount (₱)</label>
          <input id="sp-amount" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="mt-1 text-xs text-brand-500">Balance {formatCentavos(loan.balance)}</p>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="sp-paidAt">Date paid</label>
          <input id="sp-paidAt" type="date" className="input" value={paidAt} max={todayInput()} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="sp-ref">Reference no.{needsReference ? '' : ' (optional)'}</label>
          <input id="sp-ref" className="input" maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder={method === 'e_money' ? 'e.g. GCash ref. 1234 567 890' : method === 'bank_transfer' ? 'e.g. bank transaction no.' : ''} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="sp-proof">Proof (photo or PDF){needsProof ? '' : ' (optional)'}</label>
          <input id="sp-proof" type="file" accept={PROOF_ACCEPT} className="input py-1.5 text-sm" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <label className="label mt-4" htmlFor="sp-note">Note (optional)</label>
      <input id="sp-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-accent" disabled={busy}><Send className="h-4 w-4" /> {busy ? 'Sending…' : office ? 'Send to Payments' : 'Send payment'}</button>
      </div>
    </form>
  )
}
