import { useEffect, useState } from 'react'
import Field, { FormSection } from './Field'
import { memberHistory } from './applicationForm'
import type { Form } from './applicationForm'
import { api } from '../../lib/api'
import { byMemberId } from '../../lib/members'
import type { Member, MemberHistory } from '../../lib/members'
import { employmentStatusLabel } from '../../lib/applications'
import type { EmploymentStatus } from '../../lib/applications'

/** lockedMemberId: a member applying for themselves; the member picker is hidden and the ID can't change. */
type Props = { form: Form; update: (patch: Partial<Form>) => void; lockedMemberId?: string }

const statuses = Object.keys(employmentStatusLabel) as EmploymentStatus[]

export default function ApplicantSection({ form, update, lockedMemberId }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [lookupError, setLookupError] = useState('')
  useEffect(() => {
    if (lockedMemberId) return
    api<{ members: Member[] }>('/api/members?status=active')
      .then((d) => setMembers([...d.members].sort(byMemberId)))
      .catch(() => setMembers([]))
  }, [lockedMemberId])

  const pick = async (memberId: string) => {
    setLookupError('')
    if (!memberId) return update({ memberId: '' })
    update({ memberId })
    try {
      const { member, history } = await api<{ member: Member; history: MemberHistory }>(`/api/members/${encodeURIComponent(memberId)}`)
      const listed = members.find((m) => m.memberId === memberId)
      update(memberHistory(member, history, (listed?.openLoans ?? 0) > 0))
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Could not load the member.')
    }
  }
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
        {lockedMemberId ? (
          <Field id="memberId" label="Member ID">
            <input id="memberId" className="input bg-brand-50 sm:w-48" value={lockedMemberId} readOnly />
          </Field>
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem]">
          <Field id="memberPicker" label="Member (optional)" hint={lookupError || 'Picking a member fills in what UDEI has on file: name, history and balances.'}>
            <select
              id="memberPicker"
              className="input"
              value={members.some((m) => m.memberId === form.memberId) ? form.memberId : ''}
              onChange={(e) => void pick(e.target.value)}
            >
              <option value="">New applicant, or type the member no.</option>
              {members.map((m) => (
                <option key={m.memberId} value={m.memberId}>{m.fullName}{m.lastName ? ` (No. ${m.memberId})` : ''}</option>
              ))}
            </select>
          </Field>
          <Field id="memberId" label="Member ID">
            <input id="memberId" className="input" maxLength={32} placeholder="e.g. 12" value={form.memberId}
              onChange={(e) => update({ memberId: e.target.value })} />
          </Field>
        </div>
        )}

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
          <h3 className="text-sm font-semibold text-brand-800">History with UDEI</h3>
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
