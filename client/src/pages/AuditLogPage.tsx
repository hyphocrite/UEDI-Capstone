import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, History } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import TableShell from '../components/TableShell'
import { api } from '../lib/api'
import { roleLabel } from '../lib/roles'
import type { Role } from '../lib/roles'
import { PER_PAGE } from '../lib/usePaged'

/** One entry of GET /api/audit. */
type Entry = {
  _id: string
  at: string
  userName?: string
  userEmail?: string
  role?: Role
  action: string
  target?: string
  method: string
  path: string
  details?: unknown
  before?: unknown
  status: number
  ok: boolean
  error?: string
  ip?: string
  client?: 'web' | 'mobile'
}

type Result = { entries: Entry[]; total: number; page: number; limit: number; actions: string[] }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** Older entries were stored as "Payment mode changed"; they are shown in today's words (the stored text, used to filter, is unchanged). */
const actionText = (a: string) => a.replace(/^Payment mode changed/, 'Mode of payment changed')

const isEmpty = (v: unknown) => v == null || (typeof v === 'object' && Object.keys(v as object).length === 0)

function Json({ label, value }: { label: string; value: unknown }) {
  if (isEmpty(value)) return null
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-brand-700 uppercase">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-white p-3 text-xs whitespace-pre-wrap break-words text-ink">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

export default function AuditLogPage() {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState<'' | 'ok' | 'failed'>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // The server pages the log (10 at a time); the page is kept in the URL (?page=2).
  const [urlParams, setUrlParams] = useSearchParams()
  const page = Math.max(1, Number(urlParams.get('page')) || 1)
  const anchorRef = useRef<HTMLDivElement>(null)
  const setPage = (n: number, scroll = true) => {
    setUrlParams((p) => {
      const next = new URLSearchParams(p)
      if (n > 1) next.set('page', String(n))
      else next.delete('page')
      return next
    }, { replace: true })
    if (scroll) requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ block: 'nearest' }))
  }
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PER_PAGE) })
    if (query) params.set('q', query)
    if (action) params.set('action', action)
    if (outcome) params.set('outcome', outcome)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    api<Result>(`/api/audit?${params}`)
      .then((r) => {
        setResult(r)
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the audit log.'))
  }, [query, action, outcome, from, to, page])

  // Wait for typing to pause before searching. Only a changed search goes back to page 1, so a reload keeps ?page=.
  const searched = useRef('')
  useEffect(() => {
    const id = setTimeout(() => {
      const next = q.trim()
      if (next === searched.current) return
      searched.current = next
      setQuery(next)
      setUrlParams((p) => {
        const n = new URLSearchParams(p)
        n.delete('page')
        return n
      }, { replace: true })
    }, 350)
    return () => clearTimeout(id)
  }, [q, setUrlParams])

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1, false)
  }

  return (
    <>
      <PageHeader icon={History}
        title="Audit Log"
        subtitle="Every change made in the system, by anyone, on the web or the mobile app, including failed attempts. Entries can't be edited or deleted."
      />

      <div className="card min-w-0">
        <div className="grid gap-3 border-b border-brand-100 p-4 md:grid-cols-[1fr_14rem_10rem] lg:grid-cols-[1fr_14rem_10rem_9.5rem_9.5rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
            <input className="input pl-9" placeholder="Search person, email, record or action" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the audit log" />
          </div>
          <select className="input" value={action} onChange={(e) => filter(setAction)(e.target.value)} aria-label="Action">
            <option value="">All actions</option>
            {['Application approved', 'Application approved (final, loan created)', 'Application denied', 'Account unlinked from member', ...(result?.actions ?? [])]
              .filter((a, i, all) => all.indexOf(a) === i)
              .sort()
              .map((a) => <option key={a} value={a}>{actionText(a)}</option>)}
          </select>
          <select className="input" value={outcome} onChange={(e) => filter(setOutcome)(e.target.value as '' | 'ok' | 'failed')} aria-label="Outcome">
            <option value="">All outcomes</option>
            <option value="ok">Succeeded</option>
            <option value="failed">Failed or refused</option>
          </select>
          <input type="date" className="input" value={from} onChange={(e) => filter(setFrom)(e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={to} onChange={(e) => filter(setTo)(e.target.value)} aria-label="To date" />
        </div>

        {error && <p className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

        <TableShell caption="Audit log" anchor={anchorRef}
          footer={result && <Pagination page={result.page} pageSize={result.limit} total={result.total} onPage={setPage} />}>
            <thead className="table-head">
              <tr>
                <th className="w-8"><span className="sr-only">Details</span></th>
                <th>When (Manila)</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th className="w-32">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {result?.entries.map((e) => (
                <Fragment key={e._id}>
                  <tr className="row-hover cursor-pointer" onClick={() => setOpen(open === e._id ? null : e._id)}>
                    <td className="cell text-brand-500">
                      {open === e._id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="cell whitespace-nowrap">{when(e.at)}</td>
                    <td className="cell">
                      <p className="line-clamp-2 font-semibold text-ink">{e.userName || e.userEmail || 'Not signed in'}</p>
                      <p className="text-xs text-brand-500">
                        {e.role ? roleLabel[e.role] ?? e.role : 'No account'}
                        {e.userName && e.userEmail ? ` · ${e.userEmail}` : ''}
                      </p>
                    </td>
                    <td className="cell">
                      {actionText(e.action)}
                      {e.client === 'mobile' && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">Mobile</span>}
                    </td>
                    <td className="cell text-brand-700"><p className="max-w-[16rem] truncate" title={e.target || undefined}>{e.target || '—'}</p></td>
                    <td className="cell">
                      {e.ok ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Succeeded</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Failed ({e.status})</span>
                          {e.error && <p className="mt-1 max-w-[16rem] truncate text-xs text-red-700" title={e.error}>{e.error}</p>}
                        </>
                      )}
                    </td>
                  </tr>
                  {open === e._id && (
                    <tr className="bg-brand-50/60">
                      <td />
                      <td colSpan={5} className="px-4 py-4">
                        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                          <Json label="Before" value={e.before} />
                          <Json label={isEmpty(e.before) ? 'What was sent' : 'After (what was sent)'} value={e.details} />
                        </div>
                        <p className="mt-3 text-xs text-brand-500">
                          {e.method} {e.path} · {e.client === 'mobile' ? 'Mobile app' : 'Web'}{e.ip ? ` · IP ${e.ip}` : ''}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {result && result.entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-500">No entries match these filters.</td></tr>
              )}
              {!result && !error && <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-500">Loading the audit log…</td></tr>}
            </tbody>
        </TableShell>
      </div>
    </>
  )
}
