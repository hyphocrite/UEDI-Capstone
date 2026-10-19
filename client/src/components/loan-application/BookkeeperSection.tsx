import Field, { FormSection } from './Field'
import type { Form } from './applicationForm'

type Props = { form: Form; update: (patch: Partial<Form>) => void }

const rows = [
  { label: 'Long term', balance: 'longTermBalance', due: 'longTermDueDate' },
  { label: 'Short term', balance: 'shortTermBalance', due: 'shortTermDueDate' },
] as const

export default function BookkeeperSection({ form, update }: Props) {
  return (
    <FormSection title="To be filled up by the Bookkeeper" subtitle="Mutual Assistance balance to date. Leave at 0 if there is none.">
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.balance} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={r.balance} label={`${r.label} balance (₱)`}>
              <input
                id={r.balance}
                type="number"
                min={0}
                inputMode="decimal"
                className="input"
                value={form[r.balance]}
                onChange={(e) => update({ [r.balance]: e.target.value })}
              />
            </Field>
            <Field id={r.due} label={`${r.label} due date`}>
              <input id={r.due} type="date" className="input" value={form[r.due]} onChange={(e) => update({ [r.due]: e.target.value })} />
            </Field>
          </div>
        ))}
      </div>
    </FormSection>
  )
}
