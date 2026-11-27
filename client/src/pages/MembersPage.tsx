import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HandCoins, KeyRound, Pencil, PiggyBank, Plus, ReceiptText, Search, SearchX, UserCheck, UserPlus, Users } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import TableShell from '../components/TableShell'
import { usePaged } from '../lib/usePaged'
import MemberAccountsPanel from '../components/members/MemberAccountsPanel'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import MemberForm from '../components/members/MemberForm'
import CarriedDeductionForm from '../components/members/CarriedDeductionForm'
import MemberScoreModal from '../components/members/MemberScoreModal'
import { useAuth } from '../context/AuthContext'
import LedgerExportButton from '../components/LedgerExportButton'
import { atLeast } from '../lib/roles'
import { api } from '../lib/api'
import { waitingToLink } from '../lib/accounts'
import type { Account } from '../lib/accounts'
import { formatDate } from '../lib/format'
import { formatCentavos } from '../lib/loans'
import { bandLabel, bandStyle, byMemberId, memberStatusLabel, planStatusLabel } from '../lib/members'
import type { Member } from '../lib/members'
import { useSettings } from '../lib/settings'

const short = (c: number) => formatCentavos(c).replace(/\.00$/, '')
type Tab = 'members' | 'accounts'

export default function MembersPage() {
  const { settings } = useSettings()
  // The tab and page live in the URL (/members?tab=accounts&page=2), so a reload or a link keeps them.
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'accounts' ? 'accounts' : 'members'
  const setTab = (next: Tab) =>
    setParams((p) => {
      const q = new URLSearchParams(p)
      if (next === 'accounts') q.set('tab', 'accounts')
      else q.delete('tab')
      q.delete('page')
      return q
    }, { replace: true })
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [accountsError, setAccountsError] = useState('')
  const [members, setMembers] = useState<Member[] | null>(null)
  const [nextMemberId, setNextMemberId] = useState('1')
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('All')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [editing, setEditing] = useState<Member | null | 'new'>(null)
  const [notice, setNotice] = useState('')
  const [deducting, setDeducting] = useState<Member | null>(null)
  const [scoring, setScoring] = useState<Member | null>(null)
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
    // Loaded here (not in the panel) so the tab can show how many wait to be linked.
    api<{ users: Account[] }>('/api/auth/users')
      .then((d) => setAccounts(d.users))
      .catch((err: unknown) => {
        setAccounts([])
        setAccountsError(err instanceof Error ? err.message : 'Could not load accounts.')
      })
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
  const sorted = useMemo(() => [...filtered].sort(byMemberId), [filtered])
  const sortedMembers = useMemo(() => [...list].sort(byMemberId), [list])
  const { page, setPage, pageRows: visible, perPage, anchor } = usePaged(sorted, { urlParam: 'page', resetKey: [query, branch, status] })
  const waitingCount = (accounts ?? []).filter(waitingToLink).length

  const saved = (m: Member) => {
    setNotice(editing === 'new' ? `${m.fullName} was added as member no. ${m.memberId}.` : `${m.fullName}'s record was saved.`)
    void load()
  }

  const totalLoans = list.reduce((s, m) => s + (m.loanBalance ?? 0), 0)
  const totalPlans = list.reduce((s, m) => s + (m.plan?.balance ?? 0), 0)

  return (
    <>
      <PageHeader icon={Users}
        title="Members"
        subtitle="Everyone enrolled with UDEI, their Mutual Assistance balance and retirement plan."
        actions={
          <>
            {(session?.role === 'bookkeeper' || atLeast(session?.role, 'treasurer')) && <LedgerExportButton />}
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add member
            </button>
          </>
        }
      />

      <div className="mb-6 inline-flex max-w-full rounded-lg border border-brand-200 bg-white p-1" role="tablist" aria-label="Members or sign-in accounts">
        {([['members', 'Members', Users], ['accounts', 'Sign-in accounts', KeyRound]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${tab === id ? 'bg-brand-800 bg-grad-brand text-white' : 'text-brand-700 hover:bg-brand-50'}`}>
            <Icon className="h-4 w-4" /> {label}
            {id === 'accounts' && waitingCount > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none font-bold ${tab === id ? 'bg-accent text-white' : 'bg-amber-100 text-amber-800'}`}
                title={`${waitingCount} waiting to be linked`}>
                {waitingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {loadError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{loadError}</p>}

      {tab === 'accounts' ? (
        <MemberAccountsPanel members={sortedMembers} accounts={accounts} setAccounts={setAccounts} loadError={accountsError} />
      ) : (
      <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Members" value={members ? String(list.length) : '…'} hint={`${list.filter((m) => m.status === 'inactive').length} inactive`} />
        <StatCard icon={UserCheck} label="Active" value={members ? String(list.filter((m) => m.status === 'active').length) : '…'} />
        <StatCard icon={HandCoins} label="Mutual assistance balances" value={members ? short(totalLoans) : '…'} hint={`${list.filter((m) => (m.loanBalance ?? 0) > 0).length} members owe`} />
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

        <TableShell caption="Members" anchor={anchor} footer={<Pagination page={page} pageSize={perPage} total={sorted.length} onPage={setPage} />}>
            <thead className="table-head">
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Member since</th>
                <th className="text-right">Mutual assistance balance</th>
                <th className="text-right">Retirement plan</th>
                <th className="w-24">Score</th>
                <th className="w-32">Status</th>
                <th className="w-24"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {visible.map((m) => (
                <tr key={m.memberId} className="row-hover">
                  <td className="cell">
                    <p className={`line-clamp-2 font-semibold ${m.lastName ? 'text-ink' : 'text-brand-500 italic'}`}>{m.fullName}</p>
                    <p className="text-xs text-brand-500">No. {m.memberId}{m.branch ? ` · ${m.branch}` : ''}</p>
                  </td>
                  <td className="cell">
                    {m.phone || m.email ? (
                      <>
                        <p>{m.phone}</p>
                        <p className="text-xs text-brand-500">{m.email}</p>
                      </>
                    ) : <span className="text-brand-400">Not on file</span>}
                  </td>
                  <td className="cell whitespace-nowrap">{m.joinedAt ? formatDate(m.joinedAt) : <span className="text-brand-400">Not on file</span>}</td>
                  <td className="cell-num">
                    {(m.loanBalance ?? 0) > 0 ? <span className="font-semibold">{short(m.loanBalance!)}</span> : <span className="text-brand-400">None</span>}
                    {(m.openLoans ?? 0) > 0 && <p className="text-xs text-brand-500">{m.openLoans} in the system</p>}
                    {m.ledgerLoan && (
                      <Link to={`/loans/${m.ledgerLoan.id}`} className="text-xs text-accent-dark hover:underline">Payroll deduction set</Link>
                    )}
                    {!m.ledgerLoan && (m.openingLoan?.balance ?? 0) > 0 && <p className="text-xs text-amber-700">No payroll deduction yet</p>}
                  </td>
                  <td className="cell-num">
                    {m.plan ? (
                      <>
                        <p className="font-semibold">{short(m.plan.balance)}</p>
                        <p className={`text-xs ${m.plan.status === 'behind' ? 'text-amber-700' : 'text-brand-500'}`}>{planStatusLabel[m.plan.status]}</p>
                      </>
                    ) : <span className="text-brand-400">None</span>}
                  </td>
                  <td className="cell">
                    {m.score && (
                      <button className="text-left" onClick={() => setScoring(m)} title="See how the score is made up">
                        <span className="block text-base font-bold text-brand-800">{m.score.score ?? '—'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bandStyle[m.score.band]}`}>{bandLabel[m.score.band]}</span>
                      </button>
                    )}
                  </td>
                  <td className="cell">
                    <StatusBadge status={memberStatusLabel[m.status]} />
                    {m.remarks && <p className="mt-1 max-w-[16rem] truncate text-xs text-brand-600" title={m.remarks}>{m.remarks}</p>}
                  </td>
                  <td className="cell text-right whitespace-nowrap">
                    {canSetDeduction && !m.ledgerLoan && (m.openingLoan?.balance ?? 0) > 0 && (
                      <button className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50 hover:text-accent-dark" onClick={() => setDeducting(m)}
                        title="Set up payroll deduction" aria-label={`Set up payroll deduction for ${m.fullName}`}>
                        <ReceiptText className="h-4 w-4" />
                      </button>
                    )}
                    <button className="rounded p-1.5 text-brand-600 transition hover:bg-brand-50 hover:text-accent-dark" onClick={() => setEditing(m)} aria-label={`Edit ${m.fullName}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {members && filtered.length === 0 && (
                <tr><td colSpan={8}>
                  {list.length
                    ? <EmptyState icon={SearchX} title="No members match your search." hint="Check the spelling or member number, or change the status and branch filters." />
                    : <EmptyState icon={UserPlus} title="No members yet." hint="Add them here, or load UDEI's spreadsheets with the import script."
                        action={<button className="btn-primary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add member</button>} />}
                </td></tr>
              )}
              {!members && !loadError && <tr><td colSpan={8} className="px-4 py-10 text-center text-brand-500">Loading members…</td></tr>}
            </tbody>
        </TableShell>
        <p className="border-t border-brand-100 px-4 py-3 text-xs text-brand-500">
          The mutual assistance balance is what the member owes in this system plus the balance carried over from UDEI's ledger
          {list.find((m) => m.openingLoan)?.openingLoan?.asOf ? ` (as of ${formatDate(list.find((m) => m.openingLoan)!.openingLoan!.asOf)})` : ''}.
        </p>
      </div>
      </>
      )}

      {scoring && <MemberScoreModal member={scoring} onClose={() => setScoring(null)} onChanged={() => void load()} />}

      {deducting && (
        <CarriedDeductionForm
          member={deducting}
          onClose={() => setDeducting(null)}
          onSaved={(loan) => {
            setNotice(`Payroll deduction set for ${deducting.fullName}. The balance is now mutual assistance ${loan.loanNo}.`)
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
