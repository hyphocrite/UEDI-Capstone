import type { LoanApplication } from '../../lib/applications'
import { loanTypeLabel } from '../../lib/applications'
import { formatCentavos, formatDay, toCentavos } from '../../lib/loans'

/** The application's "To be filled up by the Bookkeeper" figures, with where they came from. */
export default function BookkeeperBalances({ app }: { app: LoanApplication }) {
  const b = app.bookkeeper
  if (!b) return null
  const money = (pesos?: number) => formatCentavos(toCentavos(pesos ?? 0))
  const source =
    b.source === 'ledger'
      ? `From the ledger${b.asOf ? ` as of ${formatDay(b.asOf)}` : ''}`
      : b.source === 'manual'
        ? 'Typed from the Bookkeeper’s books (no loans on record)'
        : 'Typed on the form'
  const rows: [string, number, string | undefined][] = [
    ['Long term', b.longTermBalance, b.longTermDueDate],
    ['Short term', b.shortTermBalance, b.shortTermDueDate],
  ]
  return (
    <div className="min-w-0 rounded-lg bg-brand-50 p-3 text-sm sm:p-4">
      <p className={`mb-2 text-xs font-semibold ${b.source === 'ledger' ? 'text-emerald-700' : 'text-brand-600'}`}>{source}</p>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 min-[420px]:grid-cols-3">
        {rows.map(([label, balance, due]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-brand-500">{label} balance</dt>
            <dd className="font-semibold text-ink">{money(balance)}</dd>
            {due && <dd className="text-xs text-brand-600">due {formatDay(due)}</dd>}
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-xs text-brand-500">Already deducted per month</dt>
          <dd className="font-semibold text-ink">{money(b.monthlyPayment)}</dd>
        </div>
      </dl>
      {b.loans && b.loans.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-brand-600">
          {b.loans.map((l) => (
            <li key={l.loanNo} className="break-words">
              <span className="font-semibold text-ink">{l.loanNo}</span> ({loanTypeLabel[l.loanType]}): {money(l.balance)}
              {l.maturity && `, matures ${formatDay(l.maturity)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
