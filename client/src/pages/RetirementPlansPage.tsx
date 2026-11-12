import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarClock, CalendarDays, PiggyBank, Plus, Search, TrendingUp, Wallet } from 'lucide-react'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { formatCentavos, toCentavos } from '../lib/loans'
import { byMemberId, monthLabel, planStatusLabel } from '../lib/members'
import type { Member, RetirementPlan } from '../lib/members'

const short = (c: number) => formatCentavos(c).replace(/\.00$/, '')
const today = () => new Date().toLocaleDateString('en-CA')
const thisMonth = () => today().slice(0, 7)

export default function RetirementPlansPage() {
  const { session } = useAuth()
  const canWrite = session?.role === 'bookkeeper' || session?.role === 'treasurer'
  const [plans, setPlans] = useState<RetirementPlan[] | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyBehind, setOnlyBehind] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  const load = () =>
    api<{ plans: RetirementPlan[] }>('/api/retirement-plans')
      .then((d) => setPlans(d.plans))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the plans.'))
  useEffect(() => {
    void load()
  }, [])

  const list = useMemo(() => [...(plans ?? [])].sort(byMemberId), [plans])
  const filtered = list.filter((p) => {
    const q = query.trim().toLowerCase()
    return (!onlyBehind || p.status === 'behind') && (!q || p.memberName.toLowerCase().includes(q) || p.memberId.toLowerCase().includes(q))
  })
  const selected = list.find((p) => p._id === selectedId) ?? filtered[0] ?? null
  const replace = (p: RetirementPlan) => setPlans((ps) => ps?.map((x) => (x._id === p._id ? p : x)) ?? null)
  const year = today().slice(0, 4)

  return (
    <>
      <PageHeader
        title="Retirement Plans"
        subtitle="Each member's retirement plan balance and monthly contributions."
        actions={canWrite ? <button className="btn-primary" onClick={() => setEnrolling(true)}><Plus className="h-4 w-4" /> Enroll member</button> : undefined}
      />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={PiggyBank} label="Members enrolled" value={plans ? String(list.length) : '…'} />
        <StatCard icon={Wallet} label="Total in plans" value={plans ? short(list.reduce((s, p) => s + p.balance, 0)) : '…'} />
        <StatCard icon={TrendingUp} label={`Contributed in ${year}`} value={plans ? short(list.reduce((s, p) => s + p.contributedThisYear, 0)) : '…'}
          hint={plans ? `plus ${short(list.reduce((s, p) => s + p.duesThisYear, 0))} in monthly dues` : undefined} />
        <StatCard icon={CalendarClock} label="Behind on contributions" value={plans ? String(list.filter((p) => p.status === 'behind').length) : '…'} />
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3">
        <div className="card min-w-0 lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-brand-100 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
              <input className="input pl-9" placeholder="Search by name or member no." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search plans" />
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-700">
              <input type="checkbox" checked={onlyBehind} onChange={(e) => setOnlyBehind(e.target.checked)} /> Behind only
            </label>
          </div>
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="table-head sticky top-0">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Monthly</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Last paid</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {filtered.map((p) => (
                  <tr key={p._id} onClick={() => setSelectedId(p._id)}
                    className={`cursor-pointer ${p._id === selected?._id ? 'bg-brand-50' : 'hover:bg-brand-50/50'}`}>
                    <td className="px-4 py-3">
                      <button className="text-left" onClick={() => setSelectedId(p._id)}>
                        <p className="font-semibold text-ink">{p.memberName}</p>
                        <p className="text-xs text-brand-500">No. {p.memberId}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">{p.monthlyContribution > 0 ? short(p.monthlyContribution) : <span className="text-brand-400">Not set</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold">{short(p.balance)}</td>
                    <td className="px-4 py-3">{p.lastMonthPaid ? monthLabel(p.lastMonthPaid) : <span className="text-brand-400">None yet</span>}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={planStatusLabel[p.status]} />
                      {p.missedMonths.length > 0 && <p className="mt-1 text-xs text-amber-700">{p.missedMonths.length} month{p.missedMonths.length > 1 ? 's' : ''} unpaid</p>}
                    </td>
                  </tr>
                ))}
                {plans && filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-500">{list.length ? 'No plans match.' : 'No retirement plans yet.'}</td></tr>
                )}
                {!plans && !error && <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-500">Loading plans…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {selected && <PlanDetail key={selected._id} plan={selected} canWrite={canWrite} onChange={replace} />}
      </div>

      {enrolling && <EnrollModal onClose={() => setEnrolling(false)} onSaved={(p) => { setPlans((ps) => [...(ps ?? []), p]); setSelectedId(p._id) }} />}
    </>
  )
}

function PlanDetail({ plan, canWrite, onChange }: { plan: RetirementPlan; canWrite: boolean; onChange: (p: RetirementPlan) => void }) {
  const confirm = useConfirm()
  const [form, setForm] = useState({
    month: plan.missedMonths[0] ?? thisMonth(),
    amount: String(plan.planShare / 100),
    dues: String(plan.duesShare / 100),
    paidAt: today(),
    method: 'payroll',
    reference: '',
  })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null)

  const record = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await confirm({
      title: 'Record this contribution?',
      message: <p>Record <b>{monthLabel(form.month)}</b> for <b>{plan.memberName}</b>: {formatCentavos(toCentavos(form.amount || 0))} to the plan and {formatCentavos(toCentavos(form.dues || 0))} dues, paid {form.paidAt}.</p>,
      confirmLabel: 'Yes, record it',
    })
    if (!ok) return
    setSaving(true)
    setMessage(null)
    try {
      const { plan: next } = await api<{ plan: RetirementPlan }>(`/api/retirement-plans/${plan._id}/contributions`, {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: toCentavos(form.amount), dues: toCentavos(form.dues), reference: form.reference || undefined }),
      })
      onChange(next)
      setMessage({ tone: 'ok', text: `${monthLabel(form.month)} recorded.` })
      setForm((f) => ({ ...f, month: next.missedMonths[0] ?? thisMonth(), reference: '' }))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not record the contribution.' })
    } finally {
      setSaving(false)
    }
  }

  const voidEntry = async () => {
    if (!voiding) return
    const entry = plan.contributions.find((c) => c._id === voiding.id)
    const ok = await confirm({
      title: 'Void this contribution?',
      message: (
        <p>
          Void {entry ? <><b>{monthLabel(entry.month)}</b> ({formatCentavos(entry.amount)}) </> : 'this contribution '}for <b>{plan.memberName}</b>. The plan
          balance goes down by that amount and the month shows as unpaid. Reason: “{voiding.reason}”.
        </p>
      ),
      confirmLabel: 'Yes, void it',
      danger: true,
    })
    if (!ok) return
    try {
      const { plan: next } = await api<{ plan: RetirementPlan }>(`/api/retirement-plans/${plan._id}/contributions/${voiding.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voiding.reason }),
      })
      onChange(next)
      setVoiding(null)
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not void the contribution.' })
    }
  }

  return (
    <aside className="card h-fit min-w-0 p-6">
      <p className="text-xs font-semibold tracking-wide text-brand-500 uppercase">Member no. {plan.memberId}</p>
      <h2 className="mt-1 text-lg font-bold text-brand-800">{plan.memberName}</h2>
      <p className="text-sm text-brand-600">Member since {formatDate(plan.startDate)}</p>

      <div className="mt-5 rounded-xl bg-[#0B422A] p-5 text-white">
        <p className="text-sm text-brand-200">Retirement plan balance</p>
        <p className="mt-1 text-3xl font-bold">{formatCentavos(plan.balance)}</p>
        <p className="mt-2 text-xs text-brand-200">
          {formatCentavos(plan.openingBalance)} carried over{plan.openingAsOf ? ` (${formatDate(plan.openingAsOf)})` : ''} + {formatCentavos(plan.balance - plan.openingBalance)} contributed since
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-brand-500">Monthly contribution</dt><dd className="font-semibold">{formatCentavos(plan.monthlyContribution)}</dd></div>
        <div><dt className="text-brand-500">To plan / dues</dt><dd className="font-semibold">{short(plan.planShare)} / {short(plan.duesShare)}</dd></div>
        <div><dt className="text-brand-500">Last month paid</dt><dd className="font-semibold">{plan.lastMonthPaid ? monthLabel(plan.lastMonthPaid) : 'None'}</dd></div>
        <div><dt className="text-brand-500">Unpaid months</dt><dd className={`font-semibold ${plan.missedMonths.length ? 'text-amber-700' : ''}`}>{plan.missedMonths.length}</dd></div>
      </dl>
      {plan.missedMonths.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No contribution recorded for {plan.missedMonths.map(monthLabel).join(', ')}.
        </p>
      )}

      {canWrite && (
        <form onSubmit={record} className="mt-6 space-y-3 rounded-lg border border-brand-100 p-4" noValidate>
          <h3 className="text-sm font-semibold text-brand-800">Record a contribution</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="c-month">Month covered</label>
              <input id="c-month" type="month" className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-paid">Date paid</label>
              <input id="c-paid" type="date" className="input" max={today()} value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-amount">To plan (₱)</label>
              <input id="c-amount" type="number" min={0} className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-dues">Dues (₱)</label>
              <input id="c-dues" type="number" min={0} className="input" value={form.dues} onChange={(e) => setForm({ ...form, dues: e.target.value })} /></div>
            <div><label className="label" htmlFor="c-method">Paid by</label>
              <select id="c-method" className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="payroll">Payroll</option><option value="cash">Cash</option><option value="other">Other</option>
              </select></div>
            <div><label className="label" htmlFor="c-ref">OR / reference</label>
              <input id="c-ref" className="input" maxLength={60} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
          {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
          <button className="btn-primary w-full justify-center" disabled={saving}>{saving ? 'Saving…' : 'Record contribution'}</button>
        </form>
      )}

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800"><CalendarDays className="h-4 w-4" /> Contributions</h3>
        {plan.contributions.length === 0 ? (
          <p className="mt-2 text-sm text-brand-500">None recorded yet.</p>
        ) : (
          <ul className="mt-2 max-h-80 divide-y divide-brand-50 overflow-y-auto text-sm">
            {plan.contributions.map((c) => (
              <li key={c._id} className={`py-2 ${c.voided ? 'text-brand-400 line-through' : ''}`}>
                <div className="flex justify-between gap-2">
                  <span>{monthLabel(c.month)}</span>
                  <span className="font-medium">{formatCentavos(c.amount)} <span className="text-xs text-brand-500">+ {short(c.dues)} dues</span></span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-brand-500 no-underline">
                  <span>{c.source === 'import' ? 'From UDEI spreadsheet' : `${c.method}${c.reference ? ` · ${c.reference}` : ''} · ${c.recordedByName ?? ''}`}</span>
                  {canWrite && !c.voided && <button className="text-red-600 hover:underline" onClick={() => setVoiding({ id: c._id, reason: '' })}>Void</button>}
                </div>
                {c.voided && <p className="text-xs no-underline">Voided: {c.voidReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal title="Void contribution" open={!!voiding} onClose={() => setVoiding(null)}>
        <p className="text-sm text-brand-700">The entry stays on record, crossed out, and stops counting toward the balance.</p>
        <label className="label mt-3" htmlFor="void-reason">Reason</label>
        <input id="void-reason" className="input" value={voiding?.reason ?? ''} onChange={(e) => setVoiding((v) => v && { ...v, reason: e.target.value })} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setVoiding(null)}>Cancel</button>
          <button className="btn-primary" disabled={(voiding?.reason.trim().length ?? 0) < 3} onClick={voidEntry}>Void it</button>
        </div>
      </Modal>
    </aside>
  )
}

function EnrollModal({ onClose, onSaved }: { onClose: () => void; onSaved: (p: RetirementPlan) => void }) {
  const confirm = useConfirm()
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState({ memberId: '', startDate: today(), monthlyContribution: '500', planShare: '400', openingBalance: '0' })
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ members: Member[] }>('/api/members?status=active').then((d) => setMembers(d.members.filter((m) => !m.plan))).catch(() => setMembers([]))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const who = members.find((m) => m.memberId === form.memberId)
    const ok = await confirm({
      title: 'Enroll this member?',
      message: <p>Open a retirement plan for <b>{who ? who.fullName : `member ${form.memberId}`}</b> from {form.startDate}: {formatCentavos(toCentavos(form.monthlyContribution || 0))} a month, of which {formatCentavos(toCentavos(form.planShare || 0))} goes to the plan.</p>,
      confirmLabel: 'Yes, enroll',
    })
    if (!ok) return
    try {
      const { plan } = await api<{ plan: RetirementPlan }>('/api/retirement-plans', {
        method: 'POST',
        body: JSON.stringify({
          memberId: form.memberId,
          startDate: form.startDate,
          monthlyContribution: toCentavos(form.monthlyContribution),
          planShare: toCentavos(form.planShare),
          openingBalance: toCentavos(form.openingBalance),
        }),
      })
      onSaved(plan)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll the member.')
    }
  }

  return (
    <Modal title="Enroll in the retirement plan" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="label" htmlFor="e-member">Member</label>
          <select id="e-member" className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
            <option value="">Choose a member without a plan</option>
            {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.fullName} (No. {m.memberId})</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="e-start">Contributions start</label>
            <input id="e-start" type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-open">Balance carried over (₱)</label>
            <input id="e-open" type="number" min={0} className="input" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-monthly">Monthly contribution (₱)</label>
            <input id="e-monthly" type="number" min={0} className="input" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} /></div>
          <div><label className="label" htmlFor="e-share">Of which to the plan (₱)</label>
            <input id="e-share" type="number" min={0} className="input" value={form.planShare} onChange={(e) => setForm({ ...form, planShare: e.target.value })} /></div>
        </div>
        <p className="text-xs text-brand-500">The rest of the monthly contribution is the member's monthly dues.</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!form.memberId}>Enroll</button>
        </div>
      </form>
    </Modal>
  )
}
