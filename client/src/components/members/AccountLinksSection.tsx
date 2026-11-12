import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { api } from '../../lib/api'
import { roleLabel } from '../../lib/roles'
import type { Role } from '../../lib/roles'

type Account = { id: string; fullName: string; email: string; role: Role; memberId: string | null }

/**
 * Loan Officers and up link sign-in accounts to member records here. A member account sees the
 * loans and applications filed under its member ID, so only the office can set it.
 */
export default function AccountLinksSection() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api<{ users: Account[] }>('/api/auth/users')
      .then((d) => setAccounts(d.users))
      .catch((err: unknown) => {
        setAccounts([])
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load accounts.' })
      })
  }, [])

  const draftOf = (a: Account) => drafts[a.id] ?? a.memberId ?? ''

  const save = async (a: Account) => {
    setSavingId(a.id)
    setMessage(null)
    try {
      const { user } = await api<{ user: Account }>(`/api/auth/users/${a.id}/member`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId: draftOf(a).trim() || null }),
      })
      setAccounts((list) => list?.map((x) => (x.id === user.id ? user : x)) ?? null)
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

  return (
    <section className="card mt-6 min-w-0" aria-labelledby="accounts-heading">
      <div className="border-b border-brand-100 p-4 sm:p-5">
        <h2 id="accounts-heading" className="flex items-center gap-2 font-semibold text-brand-800">
          <Link2 className="h-5 w-5 text-accent" /> Member accounts
        </h2>
        <p className="mt-1 text-sm text-brand-600">
          Link each sign-in account to its member ID. Members see only the loans under their linked ID and can apply once linked.
        </p>
      </div>

      {message && (
        <p
          className={`mx-4 mt-4 rounded-lg px-3 py-2 text-sm sm:mx-5 ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
          role={message.tone === 'ok' ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}

      {accounts === null ? (
        <p className="p-5 text-sm text-brand-500">Loading accounts…</p>
      ) : (
        <ul className="divide-y divide-brand-50">
          {accounts.map((a) => {
            const changed = draftOf(a).trim() !== (a.memberId ?? '')
            return (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{a.fullName}</p>
                  <p className="truncate text-xs text-brand-500">{a.email} · {roleLabel[a.role]}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input sm:w-40"
                    placeholder="Not linked"
                    maxLength={32}
                    aria-label={`Member ID for ${a.fullName}`}
                    value={draftOf(a)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  />
                  <button type="button" className="btn-primary" disabled={!changed || savingId !== null} onClick={() => save(a)}>
                    {savingId === a.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
