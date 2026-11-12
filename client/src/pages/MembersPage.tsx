import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, Pencil, PiggyBank, Plus, ReceiptText, Search, UserCheck, Users } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import AccountLinksSection from '../components/members/AccountLinksSection'
import MemberForm from '../components/members/MemberForm'
import CarriedDeductionForm from '../components/members/CarriedDeductionForm'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { formatCentavos } from '../lib/loans'
import { byMemberId, memberStatusLabel, planStatusLabel } from '../lib/members'
import type { Member } from '../lib/members'
import { useSettings } from '../lib/settings'

const short = (c: number) => formatCentavos(c).replace(/\.00$/, '')

export default function MembersPage() {
  const { settings } = useSettings()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [nextMemberId, setNextMemberId] = useState('1')
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('All')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [editing, setEditing] = useState<Member | null | 'new'>(null)
  const [notice, setNotice] = useState('')
  const [deducting, setDeducting] = useState<Member | null>(null)
  // Same roles that record loan payments and run payroll deductions.
  const { session } = useAuth()
  const canSetDeduction = session?.role === 'bookkeeper' || session?.role === 'treasurer'

  const load = () =>
    api<{ members: Member[]; nextMemberId: string }>('/api/members')
      .then((d) => {
        setMembers(d.members)
        setNextMemberId(d.nextMemberId)
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : 'Could not load members.'))

  useEffect(() => {
    void load()
  }, [])

  const list = useMemo(() => members ?? [], [members])
  const branchOptions = useMemo(
    () => [...new Set([...settings.branches, ...list.map((m) => m.branch).filter((b): b is string => !!b)])],
    [settings.branches, list],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list.filter(
      (m) =>
        (status === 'all' || m.status === status) &&
        (branch === 'All' || m.branch === branch) &&
        (!q || m.fullName.toLowerCase().includes(q) || m.memberId.toLowerCase() === q || m.memberId.toLowerCase().includes(q)),
    )
  }, [list, query, branch, status])

  const saved = (m: Member) => {
    setNotice(editing === 'new' ? `${m.fullName} was added as member no. ${m.memberId}.` : `${m.fullName}'s record was saved.`)
    void load()
  }

  const totalLoans = list.reduce((s, m) => s + (m.loanBalance ?? 0), 0)
  const totalPlans = list.reduce((s, m) => s + (m.plan?.balance ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Everyone enrolled with UDEI, their Mutual Assistance balance and retirement plan."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add member
          </button>
        }
      />

      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {loadError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{loadError}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Members" value={members ? String(list.length) : '…'} hint={`${list.filter((m) => m.status === 'inactive').length} inactive`} />
        <StatCard icon={UserCheck} label="Active" value={members ? String(list.filter((m) => m.status === 'active').length) : '…'} />
        <StatCard icon={HandCoins} label="Loan balances" value={members ? short(totalLoans) : '…'} hint={`${list.filter((m) => (m.loanBalance ?? 0) > 0).length} members owe`} />
        <StatCard icon={PiggyBank} label="Retirement plans" value={members ? short(totalPlans) : '…'} hint={`${list.filter((m) => m.plan).length} members enrolled`} />
      </div>

      <div className="card min-w-0">
        <div className="flex flex-col gap-3 border-b border-brand-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search by name or member no." value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search members" />
          </div>
          <select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All statuses</option>
          </select>
          <select className="input sm:w-48" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
            <option value="All">All branches</option>
            {branchOptions.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Member since</th>
                <th className="px-4 py-3 text-right">Loan balance</th>
                <th className="px-4 py-3 text-right">Retirement plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {[...filtered].sort(byMemberId).map((m) => (
                <tr key={m.memberId} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    <p className={`font-semibold ${m.lastName ? 'text-ink' : 'text-brand-500 italic'}`}>{m.fullName}</p>
                    <p className="text-xs text-brand-500">No. {m.memberId}{m.branch ? ` · ${m.branch}` : ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    {m.phone || m.email ? (
                      <>
                        <p>{m.phone}</p>
                        <p className="text-xs text-brand-500">{m.email}</p>
                      </>
                    ) : <span className="text-brand-400">Not on file</span>}
                  </td>
                  <td className="px-4 py-3">{m.joinedAt ? formatDate(m.joinedAt) : <span className="text-brand-400">Not on file</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {(m.loanBalance ?? 0) > 0 ? <span className="font-semibold">{short(m.loanBalance!)}</span> : <span className="text-brand-400">None</span>}
                    {(m.openLoans ?? 0) > 0 && <p className="text-xs text-brand-500">{m.openLoans} in the system</p>}
                    {m.ledgerLoan && (
                      <Link to={`/loans/${m.ledgerLoan.id}`} className="text-xs text-accent-dark hover:underline">Payroll deduction set</Link>
                    )}
                    {!m.ledgerLoan && (m.openingLoan?.balance ?? 0) > 0 && <p className="text-xs text-amber-700">No payroll deduction yet</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.plan ? (
                      <>
                        <p className="font-semibold">{short(m.plan.balance)}</p>
                        <p className={`text-xs ${m.plan.status === 'behind' ? 'text-amber-700' : 'text-brand-500'}`}>{planStatusLabel[m.plan.status]}</p>
                      </>
                    ) : <span className="text-brand-400">None</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={memberStatusLabel[m.status]} />
                    {m.remarks && <p className="mt-1 text-xs text-brand-600">{m.remarks}</p>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canSetDeduction && !m.ledgerLoan && (m.openingLoan?.balance ?? 0) > 0 && (
                      <button className="rounded p-1.5 text-brand-600 hover:bg-brand-50" onClick={() => setDeducting(m)}
                        title="Set up payroll deduction" aria-label={`Set up payroll deduction for ${m.fullName}`}>
                        <ReceiptText className="h-4 w-4" />
                      </button>
                    )}
                    <button className="rounded p-1.5 text-brand-600 hover:bg-brand-50" onClick={() => setEditing(m)} aria-label={`Edit ${m.fullName}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {members && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-brand-500">
                  {list.length ? 'No members match your search.' : 'No members yet. Add them here, or load UDEI\'s spreadsheets with the import script.'}
                </td></tr>
              )}
              {!members && !loadError && <tr><td colSpan={7} className="px-4 py-10 text-center text-brand-500">Loading members…</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="border-t border-brand-100 px-4 py-3 text-xs text-brand-500">
          Loan balance is what the member owes on loans in this system plus the balance carried over from UDEI's ledger
          {list.find((m) => m.openingLoan)?.openingLoan?.asOf ? ` (as of ${formatDate(list.find((m) => m.openingLoan)!.openingLoan!.asOf)})` : ''}.
        </p>
      </div>

      <AccountLinksSection />

      {deducting && (
        <CarriedDeductionForm
          member={deducting}
          onClose={() => setDeducting(null)}
          onSaved={(loan) => {
            setNotice(`Payroll deduction set for ${deducting.fullName}. The balance is now loan ${loan.loanNo}.`)
            void load()
          }}
        />
      )}

      {editing && (
        <MemberForm
          key={editing === 'new' ? 'new' : editing.memberId}
          member={editing === 'new' ? null : editing}
          nextMemberId={nextMemberId}
          branches={settings.branches}
          open
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </>
  )
}
