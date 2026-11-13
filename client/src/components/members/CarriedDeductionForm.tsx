import { useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { useConfirm } from '../../context/ConfirmContext'
import { formatCentavos, formatDay, todayKey, toCentavos } from '../../lib/loans'
import type { Loan } from '../../lib/loans'
import type { Member } from '../../lib/members'

type Frequency = 'quincenal' | 'monthly'

const pad = (n: number) => String(n).padStart(2, '0')

/** The next payroll cutoff on or after today: the 15th or month-end (quincenal), or month-end (monthly). */
function nextCutoff(frequency: Frequency) {
  const [y, m, d] = todayKey().split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (frequency === 'quincenal' && d <= 15) return `${y}-${pad(m)}-15`
  return `${y}-${pad(m)}-${pad(last)}`
}

/**
 * The Bookkeeper enters how much payroll deducts for a member's balance carried over from the
 * spreadsheet ledger. The server turns the balance into a loan with that schedule.
 */
export default function CarriedDeductionForm({ member, onClose, onSaved }: {
  member: Member
  onClose: () => void
  onSaved: (loan: Loan) => void
}) {
  const confirm = useConfirm()
  const opening = member.openingLoan!
  const [frequency, setFrequency] = useState<Frequency>('quincenal')
  const [amount, setAmount] = useState('')
  const [firstDueDate, setFirstDueDate] = useState(nextCutoff('quincenal'))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const perCutoff = toCentavos(amount || 0)
  const cutoffs = perCutoff > 0 ? Math.ceil(opening.balance / perCutoff) : 0
  const months = Math.ceil(cutoffs / (frequency === 'quincenal' ? 2 : 1))

  const changeFrequency = (f: Frequency) => {
    setFrequency(f)
    setFirstDueDate(nextCutoff(f))
    setError('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!(perCutoff >= 100)) return setError('Enter the amount to deduct each cutoff.')
    const ok = await confirm({
      title: 'Set up this payroll deduction?',
      message: (
        <>
          <p>Payroll will deduct <b>{formatCentavos(perCutoff)}</b> {frequency === 'quincenal' ? 'every payday' : 'once a month'} from <b>{member.fullName}</b>, starting {formatDay(firstDueDate)}, until the {formatCentavos(opening.balance)} balance is paid ({cutoffs} deductions).</p>
          <p>The balance becomes loan LEDGER-{member.memberId}. This can only be set up once per member.</p>
        </>
      ),
      confirmLabel: 'Yes, set it up',
    })
    if (!ok) return
    setSaving(true)
    try {
      const { loan } = await api<{ loan: Loan }>(`/api/members/${encodeURIComponent(member.memberId)}/payroll-deduction`, {
        method: 'POST',
        body: JSON.stringify({ perCutoff, paymentFrequency: frequency, firstDueDate }),
      })
      onSaved(loan)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set up the deduction.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Set up payroll deduction" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-brand-700">
          <span className="font-semibold text-ink">{member.fullName}</span> has a balance of{' '}
          <span className="font-semibold text-ink">{formatCentavos(opening.balance)}</span> carried over from UDEI's ledger
          (as of {formatDay(opening.asOf)}). Enter what payroll deducts for it. Payroll deduction runs will then include it,
          and posted deductions lower the balance.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cd-frequency">Deducted</label>
            <select id="cd-frequency" className="input" value={frequency} onChange={(e) => changeFrequency(e.target.value as Frequency)}>
              <option value="quincenal">Every payday</option>
              <option value="monthly">Once a month</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cd-amount">Amount per deduction (₱)</label>
            <input id="cd-amount" className="input" inputMode="decimal" placeholder="e.g. 750" value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setError('') }} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cd-first">First deduction</label>
          <input id="cd-first" type="date" className="input" value={firstDueDate} onChange={(e) => { setFirstDueDate(e.target.value); setError('') }} />
          <p className="mt-1 text-xs text-brand-500">
            {frequency === 'quincenal' ? 'A 15th or the last day of a month.' : 'The last day of a month.'}
          </p>
        </div>
        {cutoffs > 0 && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="status">
            {cutoffs} {cutoffs === 1 ? 'deduction' : 'deductions'} (about {months} {months === 1 ? 'month' : 'months'}) to pay off
            the balance. No further interest is added, since the ledger balance already includes it.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Set up deduction'}</button>
        </div>
      </form>
    </Modal>
  )
}
