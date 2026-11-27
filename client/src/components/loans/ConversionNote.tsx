import { RefreshCw } from 'lucide-react'
import ScheduleTable from './ScheduleTable'
import { formatCentavos, formatDay } from '../../lib/loans'
import type { Loan } from '../../lib/loans'

/** "Converted to long term on …" for a short term that wasn't paid by the end of its term. */
export function ConversionBadge({ loan }: { loan: Loan }) {
  const c = loan.conversions?.at(-1)
  if (!c) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
      <RefreshCw className="h-3.5 w-3.5" /> Converted to long term on {formatDay(c.at)}
    </span>
  )
}

/** What the conversion did, with the old short-term schedule to expand. */
export default function ConversionNote({ loan }: { loan: Loan }) {
  if (!loan.conversions?.length) return null
  return (
    <div className="space-y-2">
      {loan.conversions.map((c, i) => (
        <details key={i} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer font-semibold">
            Converted to long term on {formatDay(c.at)}: {formatCentavos(c.balance)} spread over {c.newTermMonths} months at {c.monthlyRate}% per month
          </summary>
          <p className="mt-2 text-xs">The short term wasn't fully paid by the end of its term. Its schedule before the conversion:</p>
          <div className="mt-2 rounded-lg bg-white">
            <ScheduleTable schedule={c.oldSchedule} />
          </div>
        </details>
      ))}
    </div>
  )
}
