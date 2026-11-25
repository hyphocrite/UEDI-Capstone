import { BadgeCheck, IdCard, ShieldAlert, UserCheck } from 'lucide-react'
import type { IdCheckState, LoanApplication } from '../../lib/applications'

const STYLE: Record<IdCheckState, { label: string; title: string; className: string; Icon: typeof IdCard }> = {
  passed: { label: 'ID name: Passed', title: 'The name on the ID matched the applicant when it was read.', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Icon: BadgeCheck },
  needs_check: { label: 'ID name: Needs check', title: "The ID couldn't be confirmed automatically. The Bookkeeper compares it when signing.", className: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: IdCard },
  checked: { label: 'ID name: Checked by hand', title: 'The Bookkeeper compared the ID with the applicant’s name: it matches.', className: 'bg-sky-50 text-sky-800 ring-sky-200', Icon: UserCheck },
  mismatch: { label: "ID name: Doesn't match", title: 'The Bookkeeper found that the ID name doesn’t match the applicant.', className: 'bg-red-50 text-red-800 ring-red-200', Icon: ShieldAlert },
}

/** Where the ID name check stands: Passed, Needs check, Checked by hand, or Doesn't match. */
export default function IdCheckChip({ app }: { app: LoanApplication }) {
  const state = app.idCheck?.state
  if (!state) return null
  const s = STYLE[state]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${s.className}`} title={s.title}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  )
}
