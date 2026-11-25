import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import Modal from '../Modal'
import PaymentModeChoice from '../loan-application/PaymentModeChoice'
import { api } from '../../lib/api'
import { formatDay } from '../../lib/loans'
import type { Loan } from '../../lib/loans'
import { ALL_MODES, modeLabel } from '../../lib/paymentModes'
import type { BonusType, PaymentMode } from '../../lib/paymentModes'
import { useSettings } from '../../lib/settings'

const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * How the loan is paid, the changes asked for, and (for the borrower or the Bookkeeper) a dialog to
 * change it for a coming month. Changes made after the cutoff day start the next month, because the
 * Bookkeeper bills HR for payroll deductions in the first week.
 */
export default function PaymentModePanel({ loan, canChange, onChanged }: { loan: Loan; canChange: boolean; onChanged: (loan: Loan) => void }) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PaymentMode>(loan.paymentMode ?? 'payroll')
  const [bonusType, setBonusType] = useState<BonusType | ''>(loan.bonusType ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const history = [...(loan.paymentModeHistory ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  const cutoff = settings.modeChangeCutoffDay ?? 7
  // The latest change, when it isn't in effect yet (it starts next month).
  const pending = history[0] && loan.paymentModeLabel && modeLabel(history[0].mode, history[0].bonusType) !== loan.paymentModeLabel ? history[0] : undefined

  const submit = async () => {
    if (mode === 'bonus' && !bonusType) return setError('Choose which bonus it is charged to.')
    setBusy(true)
    setError('')
    try {
      const r = await api<{ loan: Loan; message: string }>(`/api/loans/${loan._id}/payment-mode`, {
        method: 'POST',
        body: JSON.stringify({ mode, bonusType: mode === 'bonus' ? bonusType : undefined, note: note.trim() || undefined }),
      })
      onChanged(r.loan)
      setDone(r.message)
      setOpen(false)
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the mode of payment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-brand-800">Mode of payment</h2>
          <p className="text-sm text-brand-700">
            This month: <strong className="text-ink">{loan.paymentModeLabel ?? modeLabel(loan.paymentMode, loan.bonusType)}</strong>
            {pending && <> · from {MONTH.format(new Date(pending.effectiveFrom))}: <strong className="text-ink">{modeLabel(pending.mode, pending.bonusType)}</strong></>}
          </p>
        </div>
        {canChange && loan.status === 'active' && (
          <button type="button" className="btn-ghost" onClick={() => { setDone(''); setOpen(true) }}><ArrowRightLeft className="h-4 w-4" /> Change mode of payment</button>
        )}
      </div>
      {done && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{done}</p>}
      {history.length > 1 && (
        <ol className="mt-3 space-y-1 border-t border-brand-100 pt-3 text-sm">
          {history.map((h, i) => (
            <li key={`${h.effectiveFrom}-${i}`} className="text-brand-700">
              <strong className="text-ink">{modeLabel(h.mode, h.bonusType)}</strong>
              {h.note === 'On the application' ? ' · on the application' : ` · from ${MONTH.format(new Date(h.effectiveFrom))}`}
              {h.requestedByName && h.note !== 'On the application' && ` · asked by ${h.requestedByName}${h.requestedAt ? ` on ${formatDay(h.requestedAt)}` : ''}`}
              {h.note && h.note !== 'On the application' && <span className="text-brand-500"> · “{h.note}”</span>}
            </li>
          ))}
        </ol>
      )}

      <Modal title="Change mode of payment" open={open} onClose={() => setOpen(false)}>
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Changes made on or before day {cutoff} of the month start that month; later ones start next month, because the Bookkeeper bills HR for
          payroll deductions in the first week. Paying cash ahead while staying on payroll is an advance payment, not a change.
        </p>
        <PaymentModeChoice name="changeMode" mode={mode} bonusType={bonusType} modes={ALL_MODES} onChange={(m, b) => { setMode(m); setBonusType(b); setError('') }} />
        {(mode === 'bonus') !== (loan.paymentMode === 'bonus') && (
          <p className="mt-3 text-xs text-amber-700">Moving to or from a bonus lays out the unpaid balance again from the month it starts. Payments already made stay.</p>
        )}
        <label className="label mt-4" htmlFor="mode-note">Note (optional)</label>
        <input id="mode-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Will pay at the office from January" />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Change it'}</button>
        </div>
      </Modal>
    </section>
  )
}
