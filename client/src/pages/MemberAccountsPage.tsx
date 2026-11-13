import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Link2, Search, UserCheck, UserX } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { byMemberId } from '../lib/members'
import type { Member } from '../lib/members'
import { roleLabel } from '../lib/roles'
import type { Role } from '../lib/roles'

type Account = { id: string; fullName: string; email: string; role: Role; memberId: string | null; createdAt?: string }
type Show = 'unlinked' | 'linked' | 'all'

/**
 * Loan Officers and up link sign-in accounts to member records here. A member account sees the
 * loans and applications filed under its member ID, and its loan form is filled in from that record,
 * so only the office can set it.
 */
export default function MemberAccountsPage() {
  const confirm = useConfirm()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('unlinked')

  useEffect(() => {
    api<{ users: Account[] }>('/api/auth/users')
      .then((d) => setAccounts(d.users))
      .catch((err: unknown) => {
        setAccounts([])
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load accounts.' })
      })
    api<{ members: Member[] }>('/api/members')
      .then((d) => setMembers([...d.members].sort(byMemberId)))
      .catch(() => setMembers([]))
  }, [])

  const memberById = useMemo(() => new Map(members.map((m) => [m.memberId, m])), [members])
  const linkedTo = useMemo(() => new Map((accounts ?? []).filter((a) => a.memberId).map((a) => [a.memberId!, a])), [accounts])
  const draftOf = (a: Account) => drafts[a.id] ?? a.memberId ?? ''

  // Only member-level accounts (staff roles are linked too when they are also members, under "All").
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (accounts ?? []).filter((a) =>
      (show === 'all' || (show === 'linked' ? !!a.memberId : !a.memberId && a.role === 'staff')) &&
      (!q || a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || (a.memberId ?? '').toLowerCase().includes(q)),
    )
  }, [accounts, query, show])

  const counts = {
    unlinked: (accounts ?? []).filter((a) => !a.memberId && a.role === 'staff').length,
    linked: (accounts ?? []).filter((a) => a.memberId).length,
    all: accounts?.length ?? 0,
  }

  const save = async (a: Account) => {
    const memberId = draftOf(a).trim()
    const record = memberById.get(memberId)
    const other = linkedTo.get(memberId)
    if (memberId && other && other.id !== a.id) {
      return setMessage({ tone: 'error', text: `Member ${memberId} is already linked to ${other.fullName} (${other.email}). Unlink that account first.` })
    }
    const ok = await confirm({
      title: memberId ? 'Link this account?' : 'Unlink this account?',
      message: memberId ? (
        <>
          <p>
            <b>{a.fullName}</b> ({a.email}) will see every loan and application under member <b>{memberId}</b>
            {record ? <> ({record.fullName})</> : ''}{a.memberId ? `, instead of member ${a.memberId}` : ''}, and their loan form will be filled in from that record.
          </p>
          {!record && <p className="text-amber-800">There is no member record with number {memberId} yet. Check the number, or add the member first.</p>}
          <p>Check that this is the right person.</p>
        </>
      ) : (
        <p><b>{a.fullName}</b> ({a.email}) will no longer see the loans and applications of member <b>{a.memberId}</b>.</p>
      ),
      confirmLabel: memberId ? 'Yes, link' : 'Yes, unlink',
    })
    if (!ok) return
    setSavingId(a.id)
    setMessage(null)
    try {
      const { user } = await api<{ user: Account }>(`/api/auth/users/${a.id}/member`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: memberId || null }),
      })
      setAccounts((all) => all?.map((x) => (x.id === user.id ? user : x)) ?? null)
      setDrafts((d) => {
        const next = { ...d }
        delete next[a.id]
        return next
      })
      setMessage({
        tone: 'ok',
        text: user.memberId ? `${user.fullName} is linked to member ${user.memberId}.` : `${user.fullName} is no longer linked to a member.`,
      })
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
      <PageHeader
        title="Member Accounts"
        subtitle="Link each sign-in account to its UDEI member number. A linked member sees only their own loans, can apply online, and gets their loan form filled in from their record."
        actions={<Link to="/members" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Members</Link>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={UserX} label="Waiting to be linked" value={String(counts.unlinked)} hint="Member accounts with no member number" />
        <StatCard icon={UserCheck} label="Linked" value={String(counts.linked)} />
        <StatCard icon={Link2} label="Sign-in accounts" value={String(counts.all)} />
      </div>

      {message && (
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      <section className="card min-w-0">
        <div className="flex flex-col gap-3 border-b border-brand-100 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Show">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={show === t.key} onClick={() => setShow(t.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${show === t.key ? 'bg-brand-800 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative lg:ml-auto lg:w-80">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search name, email or member no." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search accounts" />
          </div>
        </div>

        <datalist id="member-numbers">
          {members.map((m) => <option key={m.memberId} value={m.memberId}>{m.fullName}</option>)}
        </datalist>

        {accounts === null ? (
          <p className="p-5 text-sm text-brand-500">Loading accounts…</p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {list.map((a) => {
              const draft = draftOf(a).trim()
              const changed = draft !== (a.memberId ?? '')
              const record = draft ? memberById.get(draft) : undefined
              return (
                <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{a.fullName}</p>
                    <p className="truncate text-xs text-brand-500">{a.email} · {roleLabel[a.role]}</p>
                  </div>
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
                      <button type="button" className="btn-primary" disabled={!changed || savingId !== null} onClick={() => save(a)}>
                        {savingId === a.id ? 'Saving…' : a.memberId && !draft ? 'Unlink' : 'Save'}
                      </button>
                    </div>
                    {draft && (
                      <p className={`text-xs ${record ? 'text-brand-600' : 'text-amber-700'}`}>
                        {record ? record.fullName : 'No member record with this number'}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
            {list.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-brand-500">
                {show === 'unlinked' && !query ? 'Every member account is linked.' : 'No accounts match.'}
              </li>
            )}
          </ul>
        )}
      </section>
    </>
  )
}
