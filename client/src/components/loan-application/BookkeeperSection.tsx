import { BookOpenCheck, Loader2 } from 'lucide-react'
import Field, { FormSection } from './Field'
import type { Form, LedgerState } from './applicationForm'
import { formatCentavos, formatDay } from '../../lib/loans'
import type { MemberBalances } from '../../lib/loans'

type Props = { form: Form; update: (patch: Partial<Form>) => void; ledger: LedgerState }

const rows = [
  { label: 'Long term', group: 'longTerm', balance: 'longTermBalance', due: 'longTermDueDate' },
  { label: 'Short term', group: 'shortTerm', balance: 'shortTermBalance', due: 'shortTermDueDate' },
] as const

/**
 * "To be filled up by the Bookkeeper". Filled from the ledger when the member has loans on record;
 * otherwise typed from the Bookkeeper's books (UDEI's older loans aren't in the system yet).
 */
export default function BookkeeperSection({ form, update, ledger }: Props) {
  const fromLedger = ledger.status === 'ledger'
  const balances = fromLedger ? ledger.balances : null
  const locked = fromLedger || ledger.status === 'loading'
  const inputClass = `input ${locked ? 'bg-brand-50 text-brand-800' : ''}`

  return (
    <FormSection title="To be filled up by the Bookkeeper" subtitle="Mutual Assistance balance to date.">
      <LedgerNote ledger={ledger} />
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.balance} className="min-w-0">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={r.balance} label={`${r.label} balance (₱)`}>
                <input id={r.balance} type="number" min={0} inputMode="decimal" className={inputClass} readOnly={locked}
                  value={form[r.balance]} onChange={(e) => update({ [r.balance]: e.target.value })} />
              </Field>
              <Field id={r.due} label={`${r.label} due date`}>
                <input id={r.due} type="date" className={inputClass} readOnly={locked}
                  value={form[r.due]} onChange={(e) => update({ [r.due]: e.target.value })} />
              </Field>
            </div>
            {balances && <LoanList group={balances[r.group]} />}
          </div>
        ))}
        <Field id="monthlyPayment" label="Paid per month on these loans (₱)" hint="What payroll already deducts for UDEI each month.">
          <input id="monthlyPayment" type="number" min={0} inputMode="decimal" className={inputClass} readOnly={locked}
            value={form.monthlyPayment} onChange={(e) => update({ monthlyPayment: e.target.value })} />
        </Field>
      </div>
    </FormSection>
  )
}

function LedgerNote({ ledger }: { ledger: LedgerState }) {
  const box = 'mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm'
  if (ledger.status === 'loading') {
    return <p className={`${box} bg-brand-50 text-brand-700`}><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> Looking up {ledger.memberId} in the ledger…</p>
  }
  if (ledger.status === 'ledger') {
    return (
      <p className={`${box} bg-emerald-50 text-emerald-800`}>
        <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>From the ledger. These can't be edited here; the Bookkeeper's signature refreshes them.</span>
      </p>
    )
  }
  if (ledger.status === 'error') {
    return <p className={`${box} bg-amber-50 text-amber-800`}>Couldn't check the ledger ({ledger.message}). Enter balances from the Bookkeeper's books.</p>
  }
  return <p className={`${box} bg-brand-50 text-brand-700`}>No loans in the system yet. Picking a member fills in the balance from UDEI's ledger; check it against the books.</p>
}

function LoanList({ group }: { group: MemberBalances['longTerm'] }) {
  if (group.loans.length === 0) return <p className="mt-1 text-xs text-brand-500">No active loans of this type.</p>
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-brand-600">
      {group.loans.map((l) => (
        <li key={l.loanNo} className="break-words">
          <span className="font-semibold text-ink">{l.loanNo}</span>: {formatCentavos(l.balance)} left,{' '}
          {formatCentavos(l.installment)} {l.paymentFrequency === 'quincenal' ? 'per quincena' : 'per month'}
          {l.maturity && `, matures ${formatDay(l.maturity)}`}
        </li>
      ))}
    </ul>
  )
}
