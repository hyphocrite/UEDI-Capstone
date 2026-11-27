import { useMemo, useState } from 'react'
import { RotateCcw, Search, Trash2 } from 'lucide-react'
import Pagination from '../Pagination'
import TableShell from '../TableShell'
import { usePaged } from '../../lib/usePaged'
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

/**
 * The run's lines, 10 at a time, with a search by name or MA no. What the Bookkeeper types is kept
 * in the run page's state by line id (`edits`), so it survives page changes and saving sends every line.
 */
export default function RunLinesTable({ mode, lines, edits = {}, onEdit, onExpected, onRemove, onRestore, canEdit }: Props) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? lines.filter((l) => [l.borrowerName, l.loanNo, l.memberId].some((v) => v?.toLowerCase().includes(q))) : lines
  }, [lines, query])
  const { page, setPage, pageRows, perPage, anchor } = usePaged(shown, { resetKey: query })
  const cols = 4 + (mode === 'draft' ? (canEdit ? 1 : 0) : 2)
  return (
    <>
    {lines.length > 10 && (
      <div className="border-b border-brand-100 px-4 py-3">
        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
          <input className="input pl-9" placeholder="Search employee name or MA no." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search lines" />
        </div>
      </div>
    )}
    <TableShell caption="Deduction lines" anchor={anchor} footer={<Pagination page={page} pageSize={perPage} total={shown.length} onPage={setPage} />}>
        <thead className="table-head">
          <tr>
            <th>Employee</th>
            <th>Mutual Assistance</th>
            <th className="text-right">Arrears</th>
            <th className="text-right">To deduct</th>
            {mode === 'draft' && canEdit && <th className="w-24"><span className="sr-only">Actions</span></th>}
            {mode !== 'draft' && <th className="text-right">Remitted</th>}
            {mode !== 'draft' && <th>Reason</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {shown.length === 0 && (
            <tr><td colSpan={cols} className="px-4 py-10 text-center text-brand-500">No line matches “{query}”.</td></tr>
          )}
          {pageRows.map((l) => {
            const edit = edits[l._id]
            const remitted = mode === 'sent' && edit ? toCentavos(edit.remitted || 0) : (l.remitted ?? l.expected)
            const reason = mode === 'sent' && edit ? edit.reason : l.reason
            const result = mode === 'draft' || l.removed ? 'full' : lineResult(l.expected, remitted, reason)
            return (
              <tr key={l._id} className={`${rowTone[result]} ${l.removed ? 'text-brand-400' : ''}`}>
                <td className="cell">
                  <p className={`line-clamp-2 font-semibold ${l.removed ? 'line-through' : 'text-ink'}`}>{l.borrowerName}</p>
                  <p className="text-xs text-brand-500">{l.memberId || 'No member ID'}</p>
                  {l.removed && <p className="max-w-[16rem] truncate text-xs text-brand-500" title={l.removedReason}>Removed: {l.removedReason}</p>}
                </td>
                <td className="cell whitespace-nowrap">
                  <p className="font-medium">{l.loanNo}</p>
                  <p className="text-xs text-brand-500">{loanTypeLabel[l.loanType]}</p>
                </td>
                <td className={`cell-num ${l.arrears > 0 ? 'text-red-700' : 'text-brand-400'}`}>
                  {l.arrears > 0 ? formatCentavos(l.arrears) : '—'}
                </td>
                <td className="cell-num">
                  {mode === 'draft' && canEdit && !l.removed && onExpected ? (
                    <ExpectedInput line={l} onCommit={(c) => onExpected(l, c)} />
                  ) : (
                    formatCentavos(l.expected)
                  )}
                </td>
                {mode === 'draft' && canEdit && (
                  <td className="cell text-right whitespace-nowrap">
                    {l.removed ? (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onRestore?.(l)}><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                    ) : (
                      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-700" onClick={() => onRemove?.(l)}><Trash2 className="h-3.5 w-3.5" /> Remove</button>
                    )}
                  </td>
                )}
                {mode === 'sent' && !l.removed && edit && canEdit ? (
                  <>
                    <td className="cell text-right">
                      <input type="number" min={0} step="0.01" inputMode="decimal" className="input w-28 text-right" aria-label={`Remitted for ${l.loanNo}`}
                        value={edit.remitted} onChange={(e) => onEdit?.(l._id, { remitted: e.target.value })} />
                    </td>
                    <td className="cell">
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
                    <td className="cell-num font-semibold">{l.removed ? '—' : formatCentavos(remitted)}</td>
                    <td className="cell max-w-[16rem] text-xs">
                      {!l.removed && result !== 'full' && <span className="font-semibold text-red-700">{result === 'missed' ? 'Missed' : 'Partial'}</span>}
                      {l.reason && <span className="block">{reasonLabel[l.reason]}{l.reasonNote && `: ${l.reasonNote}`}</span>}
                    </td>
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
    </TableShell>
    </>
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
