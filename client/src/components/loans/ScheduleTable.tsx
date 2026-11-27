import TableShell from '../TableShell'
import { formatCentavos, formatDay, todayKey } from '../../lib/loans'
import type { Installment } from '../../lib/loans'

/** The repayment schedule, every row (it is read as a whole). Paid installments are marked paid; unpaid ones due before today are red. */
export default function ScheduleTable({ schedule }: { schedule: Installment[] }) {
  const today = todayKey()
  return (
    <TableShell caption="Repayment schedule" maxHeight="tall">
        <thead className="table-head">
          <tr>
            <th>No.</th>
            <th>Due</th>
            <th className="text-right">Principal</th>
            <th className="text-right">Interest</th>
            <th className="text-right">Total</th>
            <th className="text-right">Paid</th>
            <th className="w-32">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {schedule.map((x) => {
            const paid = x.paid >= x.totalDue
            const late = !paid && x.dueDate.slice(0, 10) < today
            const state = paid ? 'Paid' : late ? 'Past due' : x.paid > 0 ? 'Part paid' : 'Due'
            return (
              <tr key={x.no} className={paid ? 'text-brand-400' : late ? 'bg-red-50/60 text-red-700' : 'text-ink'}>
                <td className="cell tabular-nums">{x.no}</td>
                <td className="cell whitespace-nowrap">{formatDay(x.dueDate)}</td>
                <td className="cell-num">{formatCentavos(x.principalDue)}</td>
                <td className="cell-num">{formatCentavos(x.interestDue)}</td>
                <td className="cell-num font-semibold">{formatCentavos(x.totalDue)}</td>
                <td className="cell-num">{x.paid ? formatCentavos(x.paid) : '—'}</td>
                <td className="cell whitespace-nowrap">
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
    </TableShell>
  )
}
