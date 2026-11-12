import { useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { employmentStatusLabel } from '../../lib/applications'
import type { EmploymentStatus } from '../../lib/applications'
import type { Member, MemberStatus } from '../../lib/members'

type Fields = {
  memberId: string
  lastName: string
  firstName: string
  middleInitial: string
  phone: string
  email: string
  branch: string
  residenceAddress: string
  employer: string
  employmentStatus: EmploymentStatus | ''
  joinedAt: string
  status: MemberStatus
  remarks: string
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '')

const fieldsOf = (m: Member | null, branch: string): Fields => ({
  memberId: m?.memberId ?? '',
  lastName: m?.lastName ?? '',
  firstName: m?.firstName ?? '',
  middleInitial: m?.middleInitial ?? '',
  phone: m?.phone ?? '',
  email: m?.email ?? '',
  branch: m?.branch ?? branch,
  residenceAddress: m?.residenceAddress ?? '',
  employer: m?.employer ?? (m ? '' : 'Davao del Norte State College'),
  employmentStatus: m?.employmentStatus ?? '',
  joinedAt: m ? day(m.joinedAt) : new Date().toLocaleDateString('en-CA'),
  status: m?.status ?? 'active',
  remarks: m?.remarks ?? '',
})

/**
 * Adds a member (member = null) or edits one. Edits ask for confirmation before saving, as the
 * panel asked: nothing in a member record changes without a second look.
 */
export default function MemberForm({ member, nextMemberId, branches, open, onClose, onSaved }: {
  member: Member | null
  nextMemberId: string
  branches: string[]
  open: boolean
  onClose: () => void
  onSaved: (m: Member) => void
}) {
  const editing = !!member
  const [form, setForm] = useState<Fields>(() => fieldsOf(member, branches[0] ?? ''))
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (key: keyof Fields) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError('')
    setConfirming(false)
  }

  const check = () => {
    if (form.phone && !/^09\d{9}$/.test(form.phone)) return 'Mobile number must be 11 digits starting with 09.'
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.'
    if (form.memberId && !/^[A-Za-z0-9-]+$/.test(form.memberId)) return 'Member numbers use letters, numbers and dashes only.'
    return ''
  }

  const save = async () => {
    setSaving(true)
    try {
      const { memberId, ...rest } = form
      const body = editing ? rest : { memberId, ...rest }
      const { member: saved } = await api<{ member: Member }>(editing ? `/api/members/${encodeURIComponent(member.memberId)}` : '/api/members', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the member.')
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = check()
    if (problem) return setError(problem)
    if (editing && !confirming) return setConfirming(true)
    void save()
  }

  const input = (key: keyof Fields, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="label" htmlFor={`m-${key}`}>{label}</label>
      <input id={`m-${key}`} className="input" value={form[key]} onChange={set(key)} {...props} />
    </div>
  )

  return (
    <Modal title={editing ? `Edit ${member.fullName}` : 'Add member'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        {editing ? (
          <p className="text-xs text-brand-500">UDEI member no. {member.memberId}. The number can't change, because loans and plans point to it.</p>
        ) : (
          input('memberId', 'UDEI member no.', { placeholder: `Leave empty for ${nextMemberId}`, maxLength: 32 })
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_5rem]">
          {input('lastName', 'Last name', { maxLength: 60, autoComplete: 'off' })}
          {input('firstName', 'First name', { maxLength: 60, autoComplete: 'off' })}
          {input('middleInitial', 'M.I.', { maxLength: 3 })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {input('phone', 'Mobile number', { inputMode: 'numeric', placeholder: '09XXXXXXXXX', maxLength: 11 })}
          {input('email', 'Email', { type: 'email', maxLength: 254 })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-branch">Branch or office</label>
            <select id="m-branch" className="input" value={form.branch} onChange={set('branch')}>
              {form.branch && !branches.includes(form.branch) && <option>{form.branch}</option>}
              <option value="">Not set</option>
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          {input('joinedAt', 'Member since', { type: 'date' })}
        </div>
        {input('residenceAddress', 'Residence address', { maxLength: 300 })}
        <div className="grid gap-4 sm:grid-cols-2">
          {input('employer', 'Employer', { maxLength: 120 })}
          <div>
            <label className="label" htmlFor="m-employmentStatus">Employment status</label>
            <select id="m-employmentStatus" className="input" value={form.employmentStatus} onChange={set('employmentStatus')}>
              <option value="">Not set</option>
              {(Object.keys(employmentStatusLabel) as EmploymentStatus[]).map((s) => <option key={s} value={s}>{employmentStatusLabel[s]}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-status">Status</label>
            <select id="m-status" className="input" value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (separated or transferred)</option>
            </select>
          </div>
          {input('remarks', 'Remarks', { maxLength: 120, placeholder: 'e.g. On Amnesty' })}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        {confirming && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            Save these changes to {member?.fullName}'s record? Press Save again to confirm.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? (confirming ? 'Yes, save' : 'Save') : 'Add member'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
