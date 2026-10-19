import { useEffect, useState } from 'react'
import { UserCog } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { ROLES, roleLabel } from '../../lib/roles'
import type { Role } from '../../lib/roles'

type UserRow = { id: string; fullName: string; email: string; role: Role; createdAt: string }

/** Admins assign roles here. Shown on the Settings page to admins only. */
export default function UsersSection() {
  const { session } = useAuth()
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api<{ users: UserRow[] }>('/api/auth/users')
      .then((d) => setUsers(d.users))
      .catch((err: unknown) => {
        setUsers([])
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load users.' })
      })
  }, [])

  const changeRole = async (u: UserRow, role: Role) => {
    setSavingId(u.id)
    setMessage(null)
    try {
      const { user } = await api<{ user: UserRow }>(`/api/auth/users/${u.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setUsers((list) => list?.map((x) => (x.id === user.id ? user : x)) ?? null)
      setMessage({ tone: 'ok', text: `${user.fullName} is now ${roleLabel[user.role]}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change the role.' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className="card mt-6 min-w-0" aria-labelledby="users-heading">
      <div className="border-b border-brand-100 p-4 sm:p-5">
        <h2 id="users-heading" className="flex items-center gap-2 font-semibold text-brand-800">
          <UserCog className="h-5 w-5 text-accent" /> Users
        </h2>
        <p className="mt-1 text-sm text-brand-600">
          Loan officers take in applications. The Bookkeeper, Treasurer, Credit Committee Chairman and President sign them, in
          that order. Administrators manage users and don't sign.
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

      {users === null ? (
        <p className="p-5 text-sm text-brand-500">Loading users…</p>
      ) : (
        <ul className="divide-y divide-brand-50">
          {users.map((u) => {
            const self = u.id === session?.id
            return (
              <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {u.fullName} {self && <span className="text-xs font-normal text-brand-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-brand-500">{u.email}</p>
                </div>
                <select
                  className="input sm:w-64"
                  value={u.role}
                  disabled={self || savingId !== null}
                  title={self ? 'You can’t change your own role.' : undefined}
                  aria-label={`Role for ${u.fullName}`}
                  onChange={(e) => changeRole(u, e.target.value as Role)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                </select>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
