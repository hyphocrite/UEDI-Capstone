import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, Hourglass, Paperclip, Pencil, Printer, XCircle } from 'lucide-react'
import CoMakerRequestNotice from './CoMakerRequestNotice'
import Pagination from '../Pagination'
import { usePaged } from '../../lib/usePaged'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { KuwiReasons, KuwiTips, MascotSays } from '../mascot/Mascot'
import { canAddDocuments, canChange, coMakerFormPath, loanTypeLabel, memberStatusText } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatDate, formatDateTime, formatPeso } from '../../lib/format'
import { roleLabel } from '../../lib/roles'

/**
 * A member's own applications on My Loans, like a parcel tracker: where each one is in the four
 * signatures, and for a denied one, why, in plain words, and what can help next time.
 */
export default function MyApplications() {
  const { session } = useAuth()
  // After changing an application or adding documents, the page that did it sends a message back.
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  const [apps, setApps] = useState<LoanApplication[] | null>(null)

  useEffect(() => {
    api<{ applications: LoanApplication[] }>('/api/applications')
      .then((d) => setApps(d.applications))
      .catch(() => setApps([]))
  }, [])
  // Tall cards: 5 at a time.
  const { anchor: pagedAnchor, ...paged } = usePaged(apps ?? [], { perPage: 5 })

  if (!apps?.length) return null
  const replace = (updated: LoanApplication) => setApps((list) => list?.map((a) => (a._id === updated._id ? updated : a)) ?? null)

  return (
    <>
    {notice && (
      <p className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
      </p>
    )}
    <section ref={pagedAnchor} className="card mb-6 min-w-0 scroll-mt-4" aria-labelledby="my-apps">
      <h2 id="my-apps" className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800">My applications</h2>
      <ul className="divide-y divide-brand-50">
        {paged.pageRows.map((a) => {
          const denial = a.approvals.find((s) => s.decision === 'denied')
          return (
            <li key={a._id} className="px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">
                  {formatPeso(a.loan.amount)} <span className="font-normal text-brand-600">{loanTypeLabel[a.loan.loanType]} · {a.loan.termMonths} months</span>
                </p>
                <p className="text-xs text-brand-500">{a.applicationNo} · filed {formatDate(a.createdAt)}</p>
              </div>
              {a.loan.purpose && <p className="text-sm text-brand-700">“{a.loan.purpose}”</p>}
              <p className="text-xs text-brand-500">
                {a.documents.length} supporting document{a.documents.length === 1 ? '' : 's'}
                {a.editedAt ? ` · changed ${formatDateTime(a.editedAt)}` : ''}
              </p>

              {(a.coMakers?.length ?? 0) > 0 && (
                <div className="mt-1 text-xs text-brand-600">
                  <p>Co-maker{a.coMakers!.length > 1 ? 's' : ''}: {a.coMakers!.map((c) => `${c.name ?? c.memberId} (${c.status === 'pending' ? 'not answered yet' : c.status})`).join(', ')}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {a.coMakers!.filter((c) => c.status !== 'declined').map((c) => (
                      <Link key={c.memberId} to={coMakerFormPath(a._id, c.memberId)} className="inline-flex items-center gap-1 font-semibold text-brand-700 underline">
                        <Printer className="h-3.5 w-3.5" /> Co-maker's statement{a.coMakers!.length > 1 ? ` (${c.name ?? c.memberId})` : ''}
                      </Link>
                    ))}
                  </p>
                </div>
              )}
              <CoMakerRequestNotice app={a} onChange={replace} />
              {a.status === 'pending' && (
                <p className="mt-2 flex items-center gap-2 text-sm text-brand-700">
                  <Hourglass className="h-4 w-4 shrink-0 text-amber-600" />
                  Waiting for the {a.currentStep !== 'none' ? roleLabel[a.currentStep] : 'signers'} · {a.approvals.length} of 4 signed
                </p>
              )}
              {canAddDocuments(a, session?.id) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canChange(a, session?.id) && (
                    <Link to={`/loans/applications/${a._id}/edit`} className="btn-ghost px-3 py-1.5 text-sm"><Pencil className="h-4 w-4" /> Change application</Link>
                  )}
                  <Link to={`/loans/applications/${a._id}/documents`} className="btn-ghost px-3 py-1.5 text-sm"><Paperclip className="h-4 w-4" /> Add supporting documents</Link>
                  <span className="text-xs text-brand-500">
                    {canChange(a, session?.id) ? 'You can change it until the Bookkeeper signs.' : 'The Bookkeeper signed, so the form is final; you can still add documents.'}
                  </span>
                </div>
              )}
              {a.status === 'approved' && (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> {memberStatusText.approved}.
                  {a.loanId ? <Link to={`/loans/${a.loanId}`} className="font-semibold underline">See mutual assistance {a.loanNo}</Link> : null}
                </p>
              )}
              {a.status === 'denied' && (
                <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                  <p className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 shrink-0" /> {memberStatusText.denied}</p>
                  {denial?.note && <p className="mt-1">The {roleLabel[denial.step]} wrote: “{denial.note}”</p>}
                  {a.explanation && (a.explanation.against.length > 0 || a.explanation.tips.length > 0) && (
                    <div className="mt-3">
                      <MascotSays mood="concerned" title="I looked at your application. Here's what counted against it:">
                        {a.explanation.against.length > 0 && (
                          <KuwiReasons kind="against" items={a.explanation.against.map((r) => r.text)} />
                        )}
                        <KuwiTips tips={a.explanation.tips} title="Kuwi recommends for next time" />
                      </MascotSays>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Pagination page={paged.page} pageSize={paged.perPage} total={paged.total} onPage={paged.setPage} />
    </section>
    </>
  )
}
