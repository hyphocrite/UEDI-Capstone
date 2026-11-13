import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '../Modal'
import { useConfirm } from '../../context/ConfirmContext'
import { api } from '../../lib/api'
import { bandLabel, bandStyle } from '../../lib/members'
import type { Member, MemberScore } from '../../lib/members'

type Bill = { _id: string; kind: string; month: string; status: 'on_time' | 'late' | 'unpaid'; note?: string; recordedByName?: string; voided: boolean }

const billKinds: Record<string, string> = { electricity: 'Electricity', water: 'Water', internet: 'Internet', mobile_load: 'Mobile load', other: 'Other' }
const billStatus: Record<Bill['status'], string> = { on_time: 'Paid on time', late: 'Paid late', unpaid: 'Not paid' }

/** A member's score, part by part, and the utility/load bills on record (staff add them here). */
export default function MemberScoreModal({ member, onClose, onChanged }: { member: Member; onClose: () => void; onChanged: () => void }) {
  const confirm = useConfirm()
  const [score, setScore] = useState<MemberScore | null>(null)
  const [bills, setBills] = useState<Bill[]>([])
  const [form, setForm] = useState(() => ({ kind: 'electricity', month: new Date().toISOString().slice(0, 7), status: 'on_time' as Bill['status'] }))
  const [error, setError] = useState('')

  const load = () => {
    api<{ score: MemberScore }>(`/api/members/${encodeURIComponent(member.memberId)}`).then((d) => setScore(d.score)).catch(() => setScore(null))
    api<{ bills: Bill[] }>(`/api/members/${encodeURIComponent(member.memberId)}/bills`).then((d) => setBills(d.bills)).catch(() => setBills([]))
  }
  useEffect(load, [member.memberId])

  const addBill = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await confirm({
      title: 'Record this bill?',
      message: <p>{billKinds[form.kind]} bill for {form.month}: <b>{billStatus[form.status].toLowerCase()}</b>, for {member.fullName}. Only record what the member showed proof of.</p>,
      confirmLabel: 'Yes, record it',
    })
    if (!ok) return
    try {
      await api(`/api/members/${encodeURIComponent(member.memberId)}/bills`, { method: 'POST', body: JSON.stringify(form) })
      setError('')
      load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the bill.')
    }
  }

  return (
    <Modal title={`Member score: ${member.fullName}`} open onClose={onClose}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {!score ? <p className="text-sm text-brand-500">Loading…</p> : (
          <>
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-bold text-brand-800">{score.score ?? '—'}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bandStyle[score.band]}`}>{bandLabel[score.band]}</span>
              <p className="text-xs text-brand-500">based on {Math.round(score.coverage * 100)}% of the possible data</p>
            </div>
            <ul className="space-y-2 text-sm">
              {score.parts.map((p) => (
                <li key={p.key}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-ink">{p.label} <span className="text-xs font-normal text-brand-500">({p.weight}%)</span></span>
                    <span className="text-brand-700">{p.value === null ? 'No data' : `${Math.round(p.value * 100)} / 100`}</span>
                  </div>
                  {p.value !== null && <div className="mt-1 h-1.5 rounded-full bg-brand-100"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%` }} /></div>}
                  <p className="mt-0.5 text-xs text-brand-600">{p.detail}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-brand-500">Parts with no data are left out instead of counting against the member.</p>
          </>
        )}

        <section className="border-t border-brand-100 pt-4">
          <h3 className="font-semibold text-brand-800">Utility and load bills</h3>
          <form onSubmit={addBill} className="mt-2 grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]" noValidate>
            <select className="input" aria-label="Kind of bill" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(billKinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="month" className="input" aria-label="Billing month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
            <select className="input" aria-label="Paid" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Bill['status'] })}>
              {(Object.keys(billStatus) as Bill['status'][]).map((s) => <option key={s} value={s}>{billStatus[s]}</option>)}
            </select>
            <button className="btn-primary" type="submit">Add</button>
          </form>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <ul className="mt-3 divide-y divide-brand-50 text-sm">
            {bills.filter((b) => !b.voided).map((b) => (
              <li key={b._id} className="flex justify-between gap-2 py-1.5">
                <span>{billKinds[b.kind]} · {b.month}</span>
                <span className={b.status === 'on_time' ? 'text-emerald-700' : 'text-red-700'}>{billStatus[b.status]}</span>
              </li>
            ))}
            {bills.filter((b) => !b.voided).length === 0 && <li className="py-2 text-brand-500">None recorded.</li>}
          </ul>
        </section>
      </div>
    </Modal>
  )
}
