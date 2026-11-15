import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Link2, Search, SearchX, UserCheck, UserX } from 'lucide-react'
import EmptyState from '../EmptyState'
import Pagination from '../Pagination'
import StatCard from '../StatCard'
import { useConfirm } from '../../context/ConfirmContext'
import { api } from '../../lib/api'
import { isLinked, waitingToLink } from '../../lib/accounts'
import type { Account } from '../../lib/accounts'
import type { Member } from '../../lib/members'
import { roleLabel } from '../../lib/roles'

type Show = 'unlinked' | 'linked' | 'all'

export const ACCOUNTS_PER_PAGE = 10

/**
 * The "Sign-in accounts" tab on Members: Loan Officers and up link sign-in accounts to member
 * records. A member account sees the loans and applications filed under its member ID, and its
 * loan form is filled in from that record, so only the office can set it.
 * Linked accounts just show their number; accounts not linked yet get a box and a Link button.
 * The page loads the members and accounts (for the tab's count) and passes them in.
 */
export default function MemberAccountsPanel({ members, accounts, setAccounts, loadError, page, onPage }: {
  /** Sorted by member number. */
  members: Member[]
  accounts: Account[] | null
  setAccounts: Dispatch<SetStateAction<Account[] | null>>
  loadError: string
  page: number
  onPage: (page: number) => void
}) {
  const confirm = useConfirm()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('unlinked')

  const memberById = useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members])
  const linkedTo = useMemo(() => new Map((accounts ?? []).filter((a) => a.memberId).map((a) => [a.memberId!, a])), [accounts])
  // The box starts empty: a new ID is not a UDEI number.
  const draftOf = (a: Account) => drafts[a.id] ?? ''
  /** Another account already linked to this number, if any. */
  const takenBy = (a: Account, memberId: string) => {
    const other = memberId ? linkedTo.get(memberId) : undefined
    return other && other.id !== a.id ? other : undefined
  }

  // Only member-level accounts (staff roles are linked too when they are also members, under "All").
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (accounts ?? []).filter((a) =>
      (show === 'all' || (show === 'linked' ? isLinked(a) : waitingToLink(a))) &&
      (!q || a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || (a.memberId ?? '').toLowerCase().includes(q)),
    )
  }, [accounts, query, show])
  const pages = Math.max(1, Math.ceil(list.length / ACCOUNTS_PER_PAGE))
  const current = Math.min(page, pages)
  const visible = list.slice((current - 1) * ACCOUNTS_PER_PAGE, current * ACCOUNTS_PER_PAGE)

  const counts = {
    unlinked: (accounts ?? []).filter(waitingToLink).length,
    linked: (accounts ?? []).filter(isLinked).length,
    all: accounts?.length ?? 0,
  }

  const link = async (a: Account) => {
    const memberId = draftOf(a).trim()
    if (!memberId) return
    const record = memberById.get(memberId)
    const other = takenBy(a, memberId)
    if (other) return setMessage({ tone: 'error', text: `Number ${memberId} is already linked to ${other.fullName}'s account (${other.email}).` })
    const ok = await confirm({
      title: 'Link this account?',
      message: (
        <>
          <p>
            <b>{a.fullName}</b> ({a.email}) will see every loan and application under member <b>{memberId}</b>
            {record ? <> ({record.fullName})</> : ''}, and their loan form will be filled in from that record.
          </p>
          {a.newMemberId && (
            <p>Everything filed under their new ID <b>{a.memberId}</b> (applications, attendance, bills) moves to member <b>{memberId}</b>, and the new ID is removed. This can't be undone.</p>
          )}
          <p>Check that this is the right person.</p>
        </>
      ),
      confirmLabel: 'Yes, link',
    })
    if (!ok) return
    setSavingId(a.id)
    setMessage(null)
    try {
      const { user } = await api<{ user: Account }>(`/api/auth/users/${a.id}/member`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId }),
      })
      setAccounts((all) => all?.map((x) => (x.id === user.id ? user : x)) ?? null)
      setDrafts((d) => {
        const next = { ...d }
        delete next[a.id]
        return next
      })
      setMessage({ tone: 'ok', text: `${user.fullName} is linked to member ${user.memberId}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not link the account.' })
    } finally {
      setSavingId(null)
    }
  }

  const tabs: { key: Show; label: string }[] = [
    { key: 'unlinked', label: `Not linked (${counts.unlinked})` },
    { key: 'linked', label: `Linked (${counts.linked})` },
    { key: 'all', label: `All accounts (${counts.all})` },
  ]

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={UserX} label="Waiting to be linked" value={accounts ? String(counts.unlinked) : '…'} hint="New accounts with only their own new ID" />
        <StatCard icon={UserCheck} label="Linked" value={accounts ? String(counts.linked) : '…'} />
        <StatCard icon={Link2} label="Sign-in accounts" value={accounts ? String(counts.all) : '…'} />
      </div>

      {(message || loadError) && (
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${message?.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role={message?.tone === 'ok' ? 'status' : 'alert'}>
          {message?.text ?? loadError}
        </p>
      )}

      <section className="card min-w-0">
        <div className="flex flex-col gap-3 border-b border-brand-100 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Show">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={show === t.key} onClick={() => { setShow(t.key); onPage(1) }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${show === t.key ? 'bg-brand-800 bg-grad-brand text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-80">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search name, email or member no." value={query}
              onChange={(e) => { setQuery(e.target.value); onPage(1) }} aria-label="Search accounts" />
          </div>
        </div>

        <datalist id="member-numbers">
          {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.fullName}</option>)}
        </datalist>

        {accounts === null ? (
          <p className="p-5 text-sm text-brand-500">Loading accounts…</p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {visible.map((a) => {
              const draft = draftOf(a).trim()
              const record = draft ? memberById.get(draft) : undefined
              const other = takenBy(a, draft)
              return (
                <li key={a.id} className="row-hover flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{a.fullName}</p>
                    <p className="truncate text-xs text-brand-500">{a.email} · {roleLabel[a.role] ?? 'Phone app member'}</p>
                    {a.newMemberId && (
                      <p className="truncate text-xs text-amber-700">
                        New ID {a.memberId}{a.memberNo ? ` · says they are Member No. ${a.memberNo}` : ''}
                      </p>
                    )}
                  </div>
                  {isLinked(a) ? (
                    // Linked: just the number.
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800">
                      <UserCheck className="h-4 w-4 text-accent-dark" /> Member No. {a.memberId}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1 sm:items-end">
                      <div className="flex gap-2">
                        <input
                          className="input sm:w-44"
                          placeholder="Member no."
                          maxLength={32}
                          list="member-numbers"
                          aria-label={`Member number for ${a.fullName}`}
                          value={draftOf(a)}
                          onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                        />
                        <button type="button" className="btn-primary" disabled={!draft || !!other || savingId !== null} onClick={() => link(a)}>
                          {savingId === a.id ? 'Linking…' : 'Link'}
                        </button>
                      </div>
                      {other ? (
                        <p className="max-w-xs text-xs font-medium text-red-700 sm:text-right" role="alert">
                          Number {draft} is already linked to {other.fullName}'s account.
                        </p>
                      ) : record ? (
                        <p className="text-xs text-brand-600">{record.fullName}</p>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
            {list.length === 0 && (
              <li>
                {show === 'unlinked' && !query
                  ? <EmptyState icon={UserCheck} title="Every member account is linked." hint="New sign-ups show up here until you link them to their UDEI member number." />
                  : <EmptyState icon={SearchX} title="No accounts match." hint="Try another name, email or member number, or show all accounts." />}
              </li>
            )}
          </ul>
        )}
        <Pagination page={current} pageSize={ACCOUNTS_PER_PAGE} total={list.length} onPage={onPage} />
      </section>
    </>
  )
}
