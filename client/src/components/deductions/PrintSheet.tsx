import { loanTypeLabel } from '../../lib/applications'
import { formatCutoff } from '../../lib/deductions'
import type { DeductionRun } from '../../lib/deductions'
import { formatCentavos } from '../../lib/loans'

/** The deduction list for DNSC's Payroll Officer. Hidden on screen; it is what window.print() shows. */
export default function PrintSheet({ run }: { run: DeductionRun }) {
  const lines = run.lines.filter((l) => !l.removed)
  const total = lines.reduce((s, l) => s + l.expected, 0)
  return (
    <section className="hidden text-[11pt] text-black print:block" aria-hidden="true">
      <header className="mb-4 text-center">
        <p className="text-lg font-bold">United DNSC Employees, Inc.</p>
        <p className="font-semibold">Payroll Deduction List</p>
        <p>Mutual Assistance installments for the cutoff of {formatCutoff(run.cutoff)}</p>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1 pr-2">Member ID</th>
            <th className="py-1 pr-2">Employee name</th>
            <th className="py-1 pr-2">Loan no.</th>
            <th className="py-1 pr-2">Loan type</th>
            <th className="py-1 text-right">Amount to deduct</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l._id} className="border-b border-gray-300 break-inside-avoid">
              <td className="py-1 pr-2">{l.memberId}</td>
              <td className="py-1 pr-2">{l.borrowerName}</td>
              <td className="py-1 pr-2">{l.loanNo}</td>
              <td className="py-1 pr-2">{loanTypeLabel[l.loanType]}</td>
              <td className="py-1 text-right">{formatCentavos(l.expected)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y border-black font-bold">
            <td className="py-1" colSpan={4}>Total, {lines.length} loans</td>
            <td className="py-1 text-right">{formatCentavos(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-16 grid grid-cols-2 gap-16 break-inside-avoid">
        <div>
          <p className="mb-10">Prepared by:</p>
          <p className="border-t border-black pt-1 font-semibold">Bookkeeper</p>
        </div>
        <div>
          <p className="mb-10">Noted by:</p>
          <p className="border-t border-black pt-1 font-semibold">Treasurer</p>
        </div>
      </div>
    </section>
  )
}
