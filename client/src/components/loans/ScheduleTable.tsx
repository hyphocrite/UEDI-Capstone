import { formatCentavos, formatDay, todayKey } from '../../lib/loans'
import type { Installment } from '../../lib/loans'

/** The repayment schedule. Paid installments are marked paid; unpaid ones due before today are red. */
export default function ScheduleTable({ schedule }: { schedule: Installment[] }) {
  const today = todayKey()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-3">No.</th>
            <th className="px-3 py-3">Due</th>
            <th className="px-3 py-3 text-right">Principal</th>
            <th className="px-3 py-3 text-right">Interest</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Paid</th>
            <th className="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {schedule.map((x) => {
            const paid = x.paid >= x.totalDue
            const late = !paid && x.dueDate.slice(0, 10) < today
            const state = paid ? 'Paid' : late ? 'Past due' : x.paid > 0 ? 'Part paid' : 'Due'
            return (
              <tr key={x.no} className={paid ? 'text-brand-400' : late ? 'bg-red-50/60 text-red-700' : 'text-ink'}>
                <td className="px-3 py-2">{x.no}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDay(x.dueDate)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCentavos(x.principalDue)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatCentavos(x.interestDue)}</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatCentavos(x.totalDue)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{x.paid ? formatCentavos(x.paid) : '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                      paid
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : late
                          ? 'bg-red-50 text-red-700 ring-red-200'
                          : x.paid > 0
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-brand-50 text-brand-700 ring-brand-200'
                    }`}
                  >
                    {state}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
