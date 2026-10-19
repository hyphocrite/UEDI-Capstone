import Field, { FormSection } from './Field'
import { memberHistory } from './applicationForm'
import type { Form } from './applicationForm'
import { members } from '../../data/mock'
import { employmentStatusLabel } from '../../lib/applications'
import type { EmploymentStatus } from '../../lib/applications'

type Props = { form: Form; update: (patch: Partial<Form>) => void }

const statuses = Object.keys(employmentStatusLabel) as EmploymentStatus[]

export default function ApplicantSection({ form, update }: Props) {
  const text = (key: keyof Form) => ({
    id: key,
    className: 'input',
    value: form[key] as string,
    onChange: (e: { target: { value: string } }) => update({ [key]: e.target.value }),
  })
  const number = (key: keyof Form) => ({ ...text(key), type: 'number', min: 0, inputMode: 'decimal' as const })

  return (
    <FormSection title="Applicant">
      <div className="space-y-4">
        <Field id="memberId" label="Member (optional)" hint="Picking a member fills in their name and history with UEDI.">
          <select
            id="memberId"
            className="input"
            value={form.memberId}
            onChange={(e) => {
              const m = members.find((x) => x.id === e.target.value)
              update(m ? memberHistory(m) : { memberId: '' })
            }}
          >
            <option value="">New applicant (not yet a member)</option>
            {members.filter((m) => m.status === 'Active').map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_6rem]">
          <Field id="lastName" label="Last Name">
            <input {...text('lastName')} autoComplete="family-name" />
          </Field>
          <Field id="firstName" label="First Name">
            <input {...text('firstName')} autoComplete="given-name" />
          </Field>
          <Field id="middleInitial" label="Middle Initial">
            <input {...text('middleInitial')} maxLength={3} />
          </Field>
        </div>

        <Field id="residenceAddress" label="Residence Address">
          <input {...text('residenceAddress')} autoComplete="street-address" placeholder="Purok, barangay, city or municipality" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="employer" label="Employer">
            <input {...text('employer')} />
          </Field>
          <Field id="employmentStatus" label="Employment status">
            <select
              id="employmentStatus"
              className="input"
              value={form.employmentStatus}
              onChange={(e) => update({ employmentStatus: e.target.value as EmploymentStatus })}
            >
              {statuses.map((s) => <option key={s} value={s}>{employmentStatusLabel[s]}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="monthlySalary" label="Monthly Salary (₱)">
            <input {...number('monthlySalary')} />
          </Field>
          <Field id="netTakeHomePay" label="Net take-home pay (₱)" hint="Per month, after deductions.">
            <input {...number('netTakeHomePay')} />
          </Field>
          <Field id="dateOfBirth" label="Date of birth (optional)" hint="The ML model uses age.">
            <input {...text('dateOfBirth')} type="date" />
          </Field>
        </div>

        <div className="rounded-lg bg-brand-50 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-brand-800">History with UEDI</h3>
          <p className="mb-3 text-xs text-brand-500">Used by the ML model to suggest approve or deny.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id="yearsAsMember" label="Years as member">
              <input {...number('yearsAsMember')} />
            </Field>
            <Field id="priorLoans" label="Past loans">
              <input {...number('priorLoans')} step={1} />
            </Field>
            <Field id="priorLatePayments" label="Late payments">
              <input {...number('priorLatePayments')} step={1} />
            </Field>
          </div>
        </div>
      </div>
    </FormSection>
  )
}
