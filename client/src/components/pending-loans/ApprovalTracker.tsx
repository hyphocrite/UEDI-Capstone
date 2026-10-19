import { Check, X } from 'lucide-react'
import type { LoanApplication } from '../../lib/applications'
import { formatDate } from '../../lib/format'
import { APPROVAL_STEPS, stepShortLabel } from '../../lib/roles'

/** Bookkeeper → Treasurer → CreCom Chairman → President, with who signed and when. */
export default function ApprovalTracker({ app }: { app: LoanApplication }) {
  // Decided before the chain existed: the old single decision is shown in the approval panel instead.
  if (app.approvals.length === 0 && app.status !== 'pending') return null

  return (
    <ol className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-4" aria-label="Approval steps">
      {APPROVAL_STEPS.map((step, i) => {
        const signed = app.approvals.find((a) => a.step === step)
        const current = app.currentStep === step
        const tone = signed
          ? signed.decision === 'approved'
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50'
          : current
            ? 'border-accent bg-white ring-2 ring-accent/30'
            : 'border-brand-100 bg-brand-50/50'
        return (
          <li key={step} className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 ${tone}`} aria-current={current ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                signed
                  ? signed.decision === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-red-600 text-white'
                  : current
                    ? 'bg-accent text-white'
                    : 'bg-brand-100 text-brand-600'
              }`}
            >
              {signed ? signed.decision === 'approved' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-ink">{stepShortLabel[step]}</span>
              <span className="block truncate text-xs text-brand-600">
                {signed
                  ? `${signed.decision === 'approved' ? 'Approved' : 'Denied'} by ${signed.signedByName ?? 'unknown'}`
                  : current
                    ? 'Waiting to sign'
                    : app.status === 'denied'
                      ? 'Not reached'
                      : 'Not yet'}
              </span>
              {signed && <span className="block text-xs text-brand-500">{formatDate(signed.signedAt)}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
