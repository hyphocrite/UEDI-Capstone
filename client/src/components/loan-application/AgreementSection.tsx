import { AlertTriangle } from 'lucide-react'
import Field, { FormSection } from './Field'
import { AUTO_RESTRUCTURE_TEXT, MAX_TERM_MONTHS, PAYROLL_DEDUCTION_TEXT, affordabilityNote, installmentOf, termMonthsOf } from './applicationForm'
import type { Form, PaymentFrequency, PeriodUnit } from './applicationForm'
import { loanTypeLabel } from '../../lib/applications'
import type { LoanType } from '../../lib/applications'
import { formatPeso } from '../../lib/format'

type Props = {
  form: Form
  update: (patch: Partial<Form>) => void
  onLoanTypeChange: (loanType: LoanType) => void
}

const loanTypes = Object.keys(loanTypeLabel) as LoanType[]

const frequencies: { value: PaymentFrequency; label: string }[] = [
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'monthly', label: 'Monthly' },
]

/** Pill-style radio group; the input stays focusable for keyboards. */
function Choice<T extends string>({ name, value, options, onChange }: {
  name: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition has-focus-visible:ring-2 has-focus-visible:ring-accent ${
            value === o.value ? 'border-brand-800 bg-brand-800 text-white' : 'border-brand-200 bg-white text-brand-800 hover:bg-brand-50'
          }`}
        >
          <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export default function AgreementSection({ form, update, onLoanTypeChange }: Props) {
  const term = termMonthsOf(form)
  const inst = installmentOf(form)
  const note = affordabilityNote(form)

  return (
    <FormSection title="Application Agreement">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="applicationDate" label="Date">
            <input id="applicationDate" type="date" className="input" value={form.applicationDate} onChange={(e) => update({ applicationDate: e.target.value })} />
          </Field>
          <div className="min-w-0">
            <span className="label">Loan type</span>
            <Choice
              name="loanType"
              value={form.loanType}
              options={loanTypes.map((t) => ({ value: t, label: loanTypeLabel[t] }))}
              onChange={onLoanTypeChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="amount" label="Amount (₱)">
            <input id="amount" type="number" min={0} step={1000} inputMode="decimal" className="input" value={form.amount} onChange={(e) => update({ amount: e.target.value })} />
          </Field>
          <Field id="purpose" label="Purpose (optional)">
            <input id="purpose" className="input" maxLength={300} value={form.purpose} onChange={(e) => update({ purpose: e.target.value })} placeholder="e.g. tuition, house repair" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field
            id="period"
            label="Period"
            hint={form.periodUnit === 'years' && term > 0 ? `${term} months` : `Up to ${MAX_TERM_MONTHS / 12} years.`}
          >
            <div className="flex gap-2">
              <input id="period" type="number" min={1} inputMode="decimal" className="input min-w-0" value={form.period} onChange={(e) => update({ period: e.target.value })} />
              <select
                className="input w-auto shrink-0"
                aria-label="Period unit"
                value={form.periodUnit}
                onChange={(e) => update({ periodUnit: e.target.value as PeriodUnit })}
              >
                <option value="years">years</option>
                <option value="months">months</option>
              </select>
            </div>
          </Field>
          <Field id="monthlyRate" label="Rate (% per month)">
            <input
              id="monthlyRate"
              type="number"
              min={0}
              max={10}
              step={0.1}
              inputMode="decimal"
              className="input"
              value={form.monthlyRate}
              onChange={(e) => update({ monthlyRate: e.target.value, rateEdited: true })}
            />
          </Field>
          <div className="min-w-0">
            <span className="label">Deduction</span>
            <Choice name="paymentFrequency" value={form.paymentFrequency} options={frequencies} onChange={(v) => update({ paymentFrequency: v })} />
          </div>
        </div>

        <dl className={`grid gap-2 rounded-lg bg-brand-50 p-3 text-center ${form.paymentFrequency === 'quincenal' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="min-w-0">
            <dt className="text-xs text-brand-600">Installment per month</dt>
            <dd className="font-bold text-brand-800">{inst ? formatPeso(Math.round(inst.monthly)) : '—'}</dd>
          </div>
          {form.paymentFrequency === 'quincenal' && (
            <div className="min-w-0">
              <dt className="text-xs text-brand-600">Per quincena (half)</dt>
              <dd className="font-bold text-brand-800">{inst ? formatPeso(Math.round(inst.quincenal)) : '—'}</dd>
            </div>
          )}
        </dl>

        {note && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{note} The application can still be submitted.</span>
          </p>
        )}

        <div className="space-y-3 border-t border-brand-100 pt-4">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1 shrink-0" checked={form.payrollDeduction} onChange={(e) => update({ payrollDeduction: e.target.checked })} />
            <span>{PAYROLL_DEDUCTION_TEXT}</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1 shrink-0" checked={form.autoRestructure} onChange={(e) => update({ autoRestructure: e.target.checked })} />
            <span>{AUTO_RESTRUCTURE_TEXT}</span>
          </label>
        </div>
      </div>
    </FormSection>
  )
}
