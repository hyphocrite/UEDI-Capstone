import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Handshake, XCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ProgressBar from '../components/ProgressBar'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { loanTypeLabel } from '../lib/applications'
import type { LoanType } from '../lib/applications'
import { formatDate, formatPeso, percent } from '../lib/format'
import { formatCentavos, formatDay } from '../lib/loans'

type Request = {
  applicationId: string
  applicationNo: string
  borrowerName: string
  amount: number
  termMonths: number
  loanType: LoanType
  purpose: string | null
  filedAt: string
  status: 'pending' | 'approved' | 'denied'
  waitingFor: string | null
  myStatus: 'pending' | 'accepted' | 'declined'
  respondedAt: string | null
  otherCoMakers: { name: string; status: string }[]
}
type VouchedLoan = {
  loanId: string
  loanNo: string
  borrowerName: string
  status: string
  balance: number
  amountPaid: number
  totalPayable: number
  nextDue: { amount: number; dueDate: string } | null
  pastDue: boolean
  pastDueAmount: number
  standing: 'on_track' | 'behind' | 'paid'
}
type Portal = { linked: boolean; requests: Request[]; loans: VouchedLoan[]; alerts: { loanId: string; text: string }[] }

/**
 * The co-maker portal: requests to vouch for a loan, the loans this member vouched for and how
 * they are being paid, and an alert when a borrower falls behind.
 */
export default function CoMakerPage() {
  const confirm = useConfirm()
  const [data, setData] = useState<Portal | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    api<Portal>('/api/comaker')
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your co-maker page.'))

  useEffect(() => {
    void load()
  }, [])

  const respond = async (r: Request, decision: 'accepted' | 'declined') => {
    const ok = await confirm({
      title: decision === 'accepted' ? 'Vouch for this loan?' : 'Decline this request?',
      message: decision === 'accepted' ? (
        <>
          <p>You agree to be co-maker for <b>{r.borrowerName}</b>'s {loanTypeLabel[r.loanType].toLowerCase()} loan of <b>{formatPeso(r.amount)}</b> over {r.termMonths} months.</p>
          <p>As co-maker you vouch that they will pay. UDEI may contact you if payments are missed. You can follow the loan on this page.</p>
        </>
      ) : (
        <p>{r.borrowerName}'s application can't be approved without a co-maker. They will need to ask someone else.</p>
      ),
      confirmLabel: decision === 'accepted' ? 'Yes, I vouch' : 'Yes, decline',
      danger: decision === 'declined',
    })
    if (!ok) return
    setBusy(r.applicationId)
    try {
      await api(`/api/comaker/requests/${r.applicationId}`, { method: 'POST', body: JSON.stringify({ decision }) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer.')
    } finally {
      setBusy(null)
    }
  }

  const pending = data?.requests.filter((r) => r.myStatus === 'pending' && r.status === 'pending') ?? []
  const answered = data?.requests.filter((r) => !(r.myStatus === 'pending' && r.status === 'pending')) ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Co-maker" subtitle="Loans you were asked to vouch for, and how the loans you vouched for are being paid." />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
      {data && !data.linked && (
        <p className="card p-5 text-sm text-amber-800">Your account isn't linked to a member record yet, so no one can name you as co-maker. Ask the UDEI office to link it.</p>
      )}

      {data?.alerts.map((a) => (
        <p key={a.loanId} className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a.text}
        </p>
      ))}

      {data?.linked && (
        <>
          <section className="card mb-6 min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800">Waiting for your answer ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-500">No one is waiting for you to vouch for them.</p>
            ) : (
              <ul className="divide-y divide-brand-50">
                {pending.map((r) => (
                  <li key={r.applicationId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{r.borrowerName} asks you to vouch for {formatPeso(r.amount)}</p>
                      <p className="text-sm text-brand-600">{loanTypeLabel[r.loanType]} · {r.termMonths} months{r.purpose ? ` · “${r.purpose}”` : ''}</p>
                      <p className="text-xs text-brand-500">{r.applicationNo} · filed {formatDate(r.filedAt)}{r.otherCoMakers.length ? ` · other co-maker: ${r.otherCoMakers.map((c) => `${c.name} (${c.status})`).join(', ')}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-ghost" disabled={busy !== null} onClick={() => void respond(r, 'declined')}><XCircle className="h-4 w-4" /> Decline</button>
                      <button className="btn-primary" disabled={busy !== null} onClick={() => void respond(r, 'accepted')}><CheckCircle2 className="h-4 w-4" /> Vouch</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card mb-6 min-w-0">
            <h2 className="flex items-center gap-2 border-b border-brand-100 px-4 py-3 font-semibold text-brand-800"><Handshake className="h-5 w-5 text-accent" /> Loans you vouched for</h2>
            {data.loans.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-500">None yet. Loans appear here once an application you vouched for is approved and released.</p>
            ) : (
              <ul className="divide-y divide-brand-50">
                {data.loans.map((l) => (
                  <li key={l.loanId} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_14rem] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{l.borrowerName} <span className="font-normal text-brand-500">· {l.loanNo}</span></p>
                      <p className={`text-sm font-semibold ${l.standing === 'behind' ? 'text-red-700' : l.standing === 'paid' ? 'text-emerald-700' : 'text-brand-700'}`}>
                        {l.standing === 'paid' ? 'Fully paid' : l.standing === 'behind' ? (l.pastDue ? `Behind: ${formatCentavos(l.pastDueAmount)} past due` : 'Last payroll deduction was missed') : 'Paying on time'}
                      </p>
                      <p className="text-xs text-brand-500">
                        Balance {formatCentavos(l.balance)}{l.nextDue && l.standing !== 'paid' ? ` · next ${formatCentavos(l.nextDue.amount)} on ${formatDay(l.nextDue.dueDate)}` : ''}
                      </p>
                    </div>
                    <ProgressBar value={percent(l.amountPaid, l.totalPayable)} label={`${l.loanNo} paid`} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {answered.length > 0 && (
            <section className="card min-w-0">
              <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800">Your earlier answers</h2>
              <ul className="divide-y divide-brand-50 text-sm">
                {answered.map((r) => (
                  <li key={r.applicationId} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <span>{r.borrowerName} · {formatPeso(r.amount)} <span className="text-brand-500">({r.applicationNo})</span></span>
                    <span className="text-brand-600">
                      You {r.myStatus === 'pending' ? "didn't answer" : r.myStatus}{r.respondedAt ? ` on ${formatDate(r.respondedAt)}` : ''} · application {r.status}{r.waitingFor ? `, at the ${r.waitingFor}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
