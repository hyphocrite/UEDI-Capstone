import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { PiggyBank, Plus, Search, UserCheck, Users, HandCoins } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import { branches, loans, members as seedMembers, retirementPlans } from '../data/mock'
import type { Member } from '../data/mock'
import { formatDate } from '../lib/format'

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>(seedMembers)
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('All')
  const [adding, setAdding] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter(
      (m) =>
        (branch === 'All' || m.branch === branch) &&
        (!q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    )
  }, [members, query, branch])

  const activeLoansFor = (id: string) => loans.filter((l) => l.memberId === id && l.status !== 'Fully paid').length
  const planFor = (id: string) => retirementPlans.find((p) => p.memberId === id)

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Everyone enrolled with UEDI, their loans and retirement plans."
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add member
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total members" value={String(members.length)} />
        <StatCard icon={UserCheck} label="Active" value={String(members.filter((m) => m.status === 'Active').length)} />
        <StatCard icon={HandCoins} label="With open loans" value={String(members.filter((m) => activeLoansFor(m.id) > 0).length)} />
        <StatCard icon={PiggyBank} label="With retirement plans" value={String(members.filter((m) => planFor(m.id)).length)} />
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-brand-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search by name or member ID" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search members" />
          </div>
          <select className="input sm:w-48" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
            <option>All</option>
            {branches.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Open loans</th>
                <th className="px-4 py-3">Retirement plan</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {filtered.map((m) => {
                const plan = planFor(m.id)
                return (
                  <tr key={m.id} className="hover:bg-brand-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{m.name}</p>
                      <p className="text-xs text-brand-500">{m.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{m.phone}</p>
                      <p className="text-xs text-brand-500">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">{m.branch}</td>
                    <td className="px-4 py-3">{formatDate(m.joined)}</td>
                    <td className="px-4 py-3">{activeLoansFor(m.id)}</td>
                    <td className="px-4 py-3">{plan ? plan.planName : <span className="text-brand-400">None</span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-brand-500">No members match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddMemberModal
        open={adding}
        onClose={() => setAdding(false)}
        nextId={`M-${String(members.length + 1).padStart(4, '0')}`}
        onAdd={(m) => setMembers((list) => [m, ...list])}
      />
    </>
  )
}

function AddMemberModal({ open, onClose, nextId, onAdd }: {
  open: boolean
  onClose: () => void
  nextId: string
  onAdd: (m: Member) => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', branch: branches[0] })
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError('Enter the member’s full name.')
    if (!/^09\d{9}$/.test(form.phone)) return setError('Phone must be 11 digits starting with 09.')
    onAdd({ id: nextId, ...form, name: form.name.trim(), joined: new Date().toISOString().slice(0, 10), status: 'Active' })
    setForm({ name: '', phone: '', email: '', branch: branches[0] })
    setError('')
    onClose()
  }

  return (
    <Modal title="Add member" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-xs text-brand-500">New member ID: {nextId}. Saved on this screen only until members are connected to the database.</p>
        <div>
          <label className="label" htmlFor="m-name">Full name</label>
          <input id="m-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-phone">Mobile number</label>
            <input id="m-phone" className="input" inputMode="numeric" placeholder="09XXXXXXXXX" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
          </div>
          <div>
            <label className="label" htmlFor="m-branch">Branch</label>
            <select id="m-branch" className="input" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
              {branches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-email">Email (optional)</label>
          <input id="m-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Add member</button>
        </div>
      </form>
    </Modal>
  )
}
