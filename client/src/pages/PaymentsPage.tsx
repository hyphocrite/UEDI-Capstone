import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, CircleSlash, Paperclip, ReceiptText, Search, Wallet } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import { SubmissionStatusChip } from '../components/payments/SubmissionList'
import { useAuth } from '../context/AuthContext'
import { api, openFile } from '../lib/api'
import { formatCentavos, formatDay, todayInput } from '../lib/loans'
import type { PaymentSubmission, SubmissionStatus } from '../lib/payments'

const PAGE_SIZE = 10

/** The four tabs, and the role that acts on each (its count shows in the navigation for that role). */
const TABS: { status: SubmissionStatus; label: string; actor?: 'treasurer' | 'bookkeeper' }[] = [
  { status: 'submitted', label: 'To receive', actor: 'treasurer' },
  { status: 'received', label: 'To confirm', actor: 'bookkeeper' },
  { status: 'posted', label: 'Posted' },
  { status: 'rejected', label: 'Rejected' },
]

type Action = 'receive' | 'confirm' | 'reject' | 'view'

/**
 * Payments outside payroll: cash, e-money and bank transfers. The Treasurer receives each one and
 * issues the Official Receipt; the Bookkeeper confirms it, and only then is it posted to the ledger.
 */
export default function PaymentsPage() {
  const { session } = useAuth()
  const role = session?.role
  const [params, setParams] = useSearchParams()
  const [list, setList] = useState<PaymentSubmission[] | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<SubmissionStatus>(role === 'bookkeeper' ? 'received' : 'submitted')
  const [month, setMonth] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<{ sub: PaymentSubmission; action: Action } | null>(null)

  // ?id=… (from a loan page) opens that payment on its tab once the list is in.
  const linkedRef = useRef(params.get('id'))
  const load = useCallback(() => {
    api<{ submissions: PaymentSubmission[] }>(`/api/payments${month ? `?month=${month}` : ''}`)
      .then((d) => {
        setList(d.submissions)
        setError('')
        const linked = linkedRef.current
        linkedRef.current = null
        const sub = linked ? d.submissions.find((x) => x._id === linked) : undefined
        if (sub) {
          setTab(sub.status)
          setOpen((o) => o ?? { sub, action: 'view' })
        }
        if (linked) setParams({}, { replace: true })
      })
      .catch((err: unknown) => {
        setList([])
        setError(err instanceof Error ? err.message : 'Could not load payments.')
      })
  }, [month, setParams])
  useEffect(load, [load])

  const counts = useMemo(() => {
    const c: Record<SubmissionStatus, number> = { submitted: 0, received: 0, posted: 0, rejected: 0 }
    for (const s of list ?? []) c[s.status] += 1
    return c
  }, [list])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter(
      (s) =>
        s.status === tab &&
        (!q || [s.borrowerName, s.memberId, s.loanNo, s.reference, s.received?.orNumber].some((v) => v?.toLowerCase().includes(q))),
    )
  }, [list, tab, query])
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const done = (updated: PaymentSubmission) => {
    setList((l) => (l ?? []).map((s) => (s._id === updated._id ? updated : s)))
    setOpen(null)
    // Ask the navigation to count again.
    window.dispatchEvent(new Event('udei:payments-changed'))
  }

  const canAct = (s: PaymentSubmission) =>
    (role === 'treasurer' && s.status === 'submitted') || (role === 'bookkeeper' && s.status === 'received')

  return (
    <>
      <PageHeader icon={Wallet} title="Payments" subtitle="Cash, e-money and bank transfers: the Treasurer issues the OR, then the Bookkeeper confirms and posts it to the ledger." />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-brand-50 p-1" role="tablist" aria-label="Payment status">
        {TABS.map((t) => (
          <button key={t.status} type="button" role="tab" aria-selected={tab === t.status}
            onClick={() => { setTab(t.status); setPage(1) }}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${tab === t.status ? 'bg-white text-brand-800 shadow-sm' : 'text-brand-600 hover:text-brand-800'}`}>
            {t.label}
            <span className={`rounded-full px-1.5 text-xs ${t.actor && t.actor === role && counts[t.status] > 0 ? 'bg-accent text-white' : 'bg-brand-100 text-brand-700'}`}>{counts[t.status]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input className="input pl-9" placeholder="Search name, UDEI no., MA no., reference or OR" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search payments" />
        </div>
        <div className="min-w-0 sm:w-48">
          <label className="label" htmlFor="pay-month">Month paid</label>
          <input id="pay-month" type="month" className="input" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1) }} />
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="card min-w-0">
        {list === null ? (
          <p className="px-4 py-6 text-sm text-brand-500">Loading…</p>
        ) : shown.length === 0 ? (
          <EmptyState icon={ReceiptText} title={`Nothing ${TABS.find((t) => t.status === tab)?.label.toLowerCase()}`}
            hint={tab === 'submitted' ? 'Payments members send, and walk-in payments, wait here for the Treasurer.' : tab === 'received' ? 'Payments with an OR wait here for the Bookkeeper.' : undefined} />
        ) : (
          <>
          {/* Phones: one card per payment instead of a wide table. */}
          <ul className="divide-y divide-brand-50 sm:hidden">
            {pageRows.map((s) => (
              <li key={s._id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{s.borrowerName}</p>
                    <p className="text-xs text-brand-600">
                      {s.memberId ? `UDEI ${s.memberId} · ` : ''}<Link to={`/loans/${s.loan}`} className="underline">{s.loanNo}</Link>
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-ink tabular-nums">{formatCentavos(s.amount)}</p>
                </div>
                <p className="mt-1 text-sm text-brand-700">
                  {s.methodLabel} · paid {formatDay(s.paidAt)}{s.reference ? ` · ref. ${s.reference}` : ''}
                  {s.received?.orNumber && <span className="font-semibold"> · OR {s.received.orNumber}</span>}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SubmissionStatusChip s={s} />
                  {s.proof && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-brand-700 underline" onClick={() => openFile(`/api/payments/${s._id}/proof`).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the file.'))}>
                      <Paperclip className="h-3.5 w-3.5" /> Proof
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  {canAct(s) ? (
                    <>
                      <button type="button" className="btn-primary flex-1 py-1.5 text-sm" onClick={() => setOpen({ sub: s, action: role === 'treasurer' ? 'receive' : 'confirm' })}>
                        {role === 'treasurer' ? 'Receive' : 'Confirm'}
                      </button>
                      <button type="button" className="btn-ghost flex-1 py-1.5 text-sm text-red-700" onClick={() => setOpen({ sub: s, action: 'reject' })}>Reject</button>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setOpen({ sub: s, action: 'view' })}>Details</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Date paid</th>
                  <th className="px-3 py-2">Borrower</th>
                  <th className="px-3 py-2">UDEI no.</th>
                  <th className="px-3 py-2">MA no.</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Reference / OR</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Proof</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {pageRows.map((s) => (
                  <tr key={s._id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDay(s.paidAt)}</td>
                    <td className="px-3 py-2 font-semibold text-ink">{s.borrowerName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.memberId || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><Link to={`/loans/${s.loan}`} className="text-brand-700 underline">{s.loanNo}</Link></td>
                    <td className="px-3 py-2 whitespace-nowrap">{s.methodLabel}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.reference || '—'}
                      {s.received?.orNumber && <span className="block text-xs font-semibold text-brand-700">OR {s.received.orNumber}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{formatCentavos(s.amount)}</td>
                    <td className="px-3 py-2">
                      {s.proof ? (
                        <button type="button" className="inline-flex items-center gap-1 text-brand-700 underline" onClick={() => openFile(`/api/payments/${s._id}/proof`).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the file.'))}>
                          <Paperclip className="h-3.5 w-3.5" /> View
                        </button>
                      ) : <span className="text-brand-400">None</span>}
                    </td>
                    <td className="px-3 py-2"><SubmissionStatusChip s={s} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        {canAct(s) ? (
                          <>
                            <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setOpen({ sub: s, action: role === 'treasurer' ? 'receive' : 'confirm' })}>
                              {role === 'treasurer' ? 'Receive' : 'Confirm'}
                            </button>
                            <button type="button" className="btn-ghost px-3 py-1 text-xs text-red-700" onClick={() => setOpen({ sub: s, action: 'reject' })}>Reject</button>
                          </>
                        ) : (
                          <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen({ sub: s, action: 'view' })}>Details</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />
      </div>

      {open && (
        <ActionModal key={`${open.sub._id}-${open.action}`} sub={open.sub} action={open.action} canAct={canAct(open.sub)} role={role}
          onAction={(action) => setOpen({ sub: open.sub, action })} onClose={() => setOpen(null)} onDone={done} onReload={load} />
      )}
    </>
  )
}

const TITLES: Record<Action, string> = {
  receive: 'Receive payment and issue the OR',
  confirm: 'Confirm and post to the ledger',
  reject: 'Reject this payment',
  view: 'Payment',
}

/** One Modal for receive, confirm, reject and details, so they all look the same. */
function ActionModal({ sub: s, action, canAct, role, onAction, onClose, onDone, onReload }: {
  sub: PaymentSubmission
  action: Action
  canAct: boolean
  role: string | undefined
  onAction: (a: Action) => void
  onClose: () => void
  onDone: (s: PaymentSubmission) => void
  onReload: () => void
}) {
  const [orNumber, setOrNumber] = useState('')
  const [receivedAt, setReceivedAt] = useState(todayInput)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (path: string, body?: object) => {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ submission: PaymentSubmission }>(`/api/payments/${s._id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) })
      onDone(r.submission)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      onReload()
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (action === 'receive') {
      if (!orNumber.trim()) return setError('Enter the OR number.')
      return run('receive', { orNumber: orNumber.trim(), receivedAt })
    }
    if (action === 'confirm') return run('confirm')
    if (action === 'reject') {
      if (reason.trim().length < 3) return setError('Give a reason for rejecting this payment.')
      return run('reject', { reason: reason.trim() })
    }
  }

  return (
    <Modal title={TITLES[action]} open onClose={onClose}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-brand-50 p-3 text-sm">
        <Row label="Borrower" value={`${s.borrowerName}${s.memberId ? ` (${s.memberId})` : ''}`} wide />
        <Row label="MA no." value={s.loanNo} />
        <Row label="Amount" value={formatCentavos(s.amount)} strong />
        <Row label="Method" value={s.methodLabel} />
        <Row label="Date paid" value={formatDay(s.paidAt)} />
        {s.reference && <Row label="Reference" value={s.reference} />}
        <Row label="Sent by" value={s.source === 'office' ? `${s.submittedByName} (office)` : `${s.submittedByName} (member)`} />
        {s.received?.orNumber && <Row label="OR" value={`${s.received.orNumber}, ${s.received.receivedAt ? formatDay(s.received.receivedAt) : ''} by ${s.received.byName}`} wide />}
        {s.confirmed?.byName && <Row label="Posted by" value={s.confirmed.byName} />}
        {s.note && <Row label="Note" value={s.note} wide />}
        {s.rejected?.reason && <Row label="Rejected" value={`${s.rejected.byName}: ${s.rejected.reason}`} wide />}
        {s.voided?.reason && <Row label="Voided" value={`${s.voided.byName}: ${s.voided.reason}`} wide />}
      </dl>
      {s.proof ? (
        <button type="button" className="btn-ghost mt-3 px-3 py-1 text-xs" onClick={() => openFile(`/api/payments/${s._id}/proof`).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the file.'))}>
          <Paperclip className="h-3.5 w-3.5" /> Open proof of payment
        </button>
      ) : (
        <p className="mt-3 text-xs text-brand-500">No proof uploaded{s.method === 'cash' ? ' (optional for cash).' : '.'}</p>
      )}

      {action === 'receive' && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="text-sm text-brand-700 sm:col-span-2">
            {s.method === 'bank_transfer' ? 'Check that the transfer came in to UDEI’s account, then' : s.method === 'e_money' ? 'Check that it came in to UDEI’s e-money account, then' : 'Count the cash, then'} enter the Official Receipt you issued.
          </p>
          <div className="min-w-0">
            <label className="label" htmlFor="or-no">OR number</label>
            <input id="or-no" className="input" maxLength={30} value={orNumber} onChange={(e) => setOrNumber(e.target.value)} placeholder="e.g. 004512" />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="or-date">Date received</label>
            <input id="or-date" type="date" className="input" value={receivedAt} max={todayInput()} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
        </div>
      )}
      {action === 'confirm' && (
        <p className="mt-4 text-sm text-brand-700">
          Posting records <b>{formatCentavos(s.amount)}</b> (OR {s.received?.orNumber}) on <b>{s.loanNo}</b> and lowers the balance. It is applied to the oldest
          unpaid installments first; payroll keeps deducting the same amount, so the mutual assistance finishes earlier.
        </p>
      )}
      {action === 'reject' && (
        <>
          <label className="label mt-4" htmlFor="rej-reason">Reason (the member is emailed)</label>
          <textarea id="rej-reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={role === 'treasurer' ? 'e.g. No transfer with this reference came in.' : 'e.g. Amount on the OR does not match.'} />
        </>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>{action === 'view' ? 'Close' : 'Cancel'}</button>
        {action === 'view' && canAct && (
          <>
            <button type="button" className="btn-ghost text-red-700" onClick={() => onAction('reject')}><CircleSlash className="h-4 w-4" /> Reject</button>
            <button type="button" className="btn-primary" onClick={() => onAction(role === 'treasurer' ? 'receive' : 'confirm')}><CheckCircle2 className="h-4 w-4" /> {role === 'treasurer' ? 'Receive' : 'Confirm'}</button>
          </>
        )}
        {action === 'receive' && <button type="button" className="btn-primary" disabled={busy} onClick={submit}><ReceiptText className="h-4 w-4" /> {busy ? 'Saving…' : 'Receive, OR issued'}</button>}
        {action === 'confirm' && <button type="button" className="btn-approve" disabled={busy} onClick={submit}><CheckCircle2 className="h-4 w-4" /> {busy ? 'Posting…' : 'Confirm and post'}</button>}
        {action === 'reject' && <button type="button" className="btn-deny" disabled={busy} onClick={submit}><CircleSlash className="h-4 w-4" /> {busy ? 'Rejecting…' : 'Reject payment'}</button>}
      </div>
    </Modal>
  )
}

function Row({ label, value, strong = false, wide = false }: { label: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-xs text-brand-500">{label}</dt>
      <dd className={`break-words ${strong ? 'font-bold text-ink' : 'font-semibold text-ink'}`}>{value}</dd>
    </div>
  )
}
