import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Hourglass, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { loanTypeLabel } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatDate, formatPeso } from '../../lib/format'
import { roleLabel } from '../../lib/roles'

/**
 * A member's own applications on My Loans, like a parcel tracker: where each one is in the four
 * signatures, and for a denied one, why, in plain words, and what can help next time.
 */
export default function MyApplications() {
  const [apps, setApps] = useState<LoanApplication[] | null>(null)

  useEffect(() => {
    api<{ applications: LoanApplication[] }>('/api/applications')
      .then((d) => setApps(d.applications))
      .catch(() => setApps([]))
  }, [])

  if (!apps?.length) return null

  return (
    <section className="card mb-6 min-w-0" aria-labelledby="my-apps">
      <h2 id="my-apps" className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800">My applications</h2>
      <ul className="divide-y divide-brand-50">
        {apps.map((a) => {
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

              {a.status === 'pending' && (
                <p className="mt-2 flex items-center gap-2 text-sm text-brand-700">
                  <Hourglass className="h-4 w-4 shrink-0 text-amber-600" />
                  Waiting for the {a.currentStep !== 'none' ? roleLabel[a.currentStep] : 'signers'} · {a.approvals.length} of 4 signed
                </p>
              )}
              {a.status === 'approved' && (
                <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Approved.
                  {a.loanId ? <Link to={`/loans/${a.loanId}`} className="font-semibold underline">See loan {a.loanNo}</Link> : null}
                </p>
              )}
              {a.status === 'denied' && (
                <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
                  <p className="flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 shrink-0" /> Not approved</p>
                  {denial?.note && <p className="mt-1">The {roleLabel[denial.step]} wrote: “{denial.note}”</p>}
                  {a.explanation && a.explanation.against.length > 0 && (
                    <>
                      <p className="mt-2 font-semibold">What counted against it</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">{a.explanation.against.map((r) => <li key={r.feature}>{r.text}</li>)}</ul>
                    </>
                  )}
                  {a.explanation && a.explanation.tips.length > 0 && (
                    <>
                      <p className="mt-2 font-semibold">What can help next time</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">{a.explanation.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
