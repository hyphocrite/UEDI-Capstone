import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { loanTypeLabel } from '../../lib/applications'
import { lineResult, reasonLabel } from '../../lib/deductions'
import type { MissReason, RunLine, RunStatus } from '../../lib/deductions'
import { formatCentavos, toCentavos } from '../../lib/loans'

/** What the Bookkeeper typed for one line of a sent run. Amounts are pesos as typed. */
export type LineEdit = { remitted: string; reason: MissReason | ''; reasonNote: string }

type Props = {
  mode: RunStatus
  lines: RunLine[]
  edits?: Record<string, LineEdit>
  onEdit?: (lineId: string, patch: Partial<LineEdit>) => void
  onExpected?: (line: RunLine, centavos: number) => void
  onRemove?: (line: RunLine) => void
  onRestore?: (line: RunLine) => void
  canEdit: boolean
}

const reasons = Object.keys(reasonLabel) as MissReason[]

const rowTone = { missed: 'bg-red-50/70', partial: 'bg-amber-50/70', full: '' }

/** The run's lines. Scrolls sideways inside its own box on small screens. */
export default function RunLinesTable({ mode, lines, edits = {}, onEdit, onExpected, onRemove, onRestore, canEdit }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-3 py-3">Employee</th>
            <th className="px-3 py-3">Loan</th>
            <th className="px-3 py-3 text-right">Arrears</th>
            <th className="px-3 py-3 text-right">To deduct</th>
            {mode === 'draft' && canEdit && <th className="px-3 py-3"><span className="sr-only">Actions</span></th>}
            {mode !== 'draft' && <th className="px-3 py-3 text-right">Remitted</th>}
            {mode !== 'draft' && <th className="px-3 py-3">Reason</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {lines.map((l) => {
            const edit = edits[l._id]
            const remitted = mode === 'sent' && edit ? toCentavos(edit.remitted || 0) : (l.remitted ?? l.expected)
            const reason = mode === 'sent' && edit ? edit.reason : l.reason
            const result = mode === 'draft' || l.removed ? 'full' : lineResult(l.expected, remitted, reason)
            return (
              <tr key={l._id} className={`${rowTone[result]} ${l.removed ? 'text-brand-400' : ''}`}>
                <td className="px-3 py-2">
                  <p className={`font-semibold whitespace-nowrap ${l.removed ? 'line-through' : 'text-ink'}`}>{l.borrowerName}</p>
                  <p className="text-xs text-brand-500">{l.memberId || 'No member ID'}</p>
                  {l.removed && <p className="text-xs text-brand-500">Removed: {l.removedReason}</p>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <p className="font-medium">{l.loanNo}</p>
                  <p className="text-xs text-brand-500">{loanTypeLabel[l.loanType]}</p>
                </td>
                <td className={`px-3 py-2 text-right whitespace-nowrap ${l.arrears > 0 ? 'text-red-700' : 'text-brand-400'}`}>
                  {l.arrears > 0 ? formatCentavos(l.arrears) : '—'}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {mode === 'draft' && canEdit && !l.removed && onExpected ? (
                    <ExpectedInput line={l} onCommit={(c) => onExpected(l, c)} />
                  ) : (
                    formatCentavos(l.expected)
                  )}
                </td>
                {mode === 'draft' && canEdit && (
                  <td className="px-3 py-2 text-right">
                    {l.removed ? (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onRestore?.(l)}><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                    ) : (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-700" onClick={() => onRemove?.(l)}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                    )}
                  </td>
                )}
                {mode === 'sent' && !l.removed && edit && canEdit ? (
                  <>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="0.01" inputMode="decimal" className="input w-28 text-right" aria-label={`Remitted for ${l.loanNo}`}
                        value={edit.remitted} onChange={(e) => onEdit?.(l._id, { remitted: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-56 flex-col gap-1">
                        <select className={`input ${result !== 'full' && !edit.reason ? 'border-red-300' : ''}`} aria-label={`Reason for ${l.loanNo}`}
                          value={edit.reason} onChange={(e) => onEdit?.(l._id, { reason: e.target.value as MissReason | '' })}>
                          <option value="">{result === 'full' ? '—' : 'Choose a reason'}</option>
                          {reasons.map((r) => <option key={r} value={r}>{reasonLabel[r]}</option>)}
                        </select>
                        {edit.reason === 'other' && (
                          <input className="input" placeholder="Describe the reason" maxLength={300} aria-label={`Reason note for ${l.loanNo}`}
                            value={edit.reasonNote} onChange={(e) => onEdit?.(l._id, { reasonNote: e.target.value })} />
                        )}
                      </div>
                    </td>
                  </>
                ) : mode !== 'draft' ? (
                  <>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{l.removed ? '—' : formatCentavos(remitted)}</td>
                    <td className="px-3 py-2 text-xs">
                      {!l.removed && result !== 'full' && <span className="font-semibold text-red-700">{result === 'missed' ? 'Missed' : 'Partial'}</span>}
                      {l.reason && <span className="block">{reasonLabel[l.reason]}{l.reasonNote && `: ${l.reasonNote}`}</span>}
                    </td>
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Amount to deduct in a draft, saved when the field loses focus. */
function ExpectedInput({ line, onCommit }: { line: RunLine; onCommit: (centavos: number) => void }) {
  const [value, setValue] = useState(String(line.expected / 100))
  return (
    <input type="number" min={0} step="0.01" inputMode="decimal" className="input w-28 text-right" aria-label={`Amount to deduct for ${line.loanNo}`}
      value={value} onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const c = toCentavos(value || 0)
        if (c >= 0 && c !== line.expected) onCommit(c)
      }} />
  )
}
