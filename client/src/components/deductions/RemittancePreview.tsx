import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HelpCircle, SearchX } from 'lucide-react'
import { api } from '../../lib/api'
import type { RemittancePreview as Preview, RunLine } from '../../lib/deductions'
import { formatCentavos } from '../../lib/loans'

const BY: Record<string, string> = { loan_no: 'MA no.', member_no: 'UDEI no.', employee_no: 'employee no.', name: 'name' }

/**
 * The review of Accounting's remittance list before anything is filled in: matched rows, ambiguous
 * rows (pick one), rows not found, and run lines with no row (not remitted). The Bookkeeper can change
 * any match, then Apply fills the remitted amounts in the form; saving and posting stay separate.
 */
export default function RemittancePreview({ preview, lines, busy, onReread, onApply, onCancel }: {
  preview: Preview
  lines: RunLine[]
  busy: boolean
  onReread: (opts: { sheet?: string; amount?: string }) => void
  onApply: (updates: { lineId: string; loanNo: string; remitted: number }[]) => void
  onCancel: () => void
}) {
  const live = useMemo(() => lines.filter((l) => !l.removed), [lines])
  // Row number → chosen line id ('' = none).
  const [choice, setChoice] = useState<Record<number, string>>(() =>
    Object.fromEntries(preview.rows.map((r) => [r.row, r.status === 'matched' ? r.lineId ?? '' : ''])),
  )
  const [error, setError] = useState('')

  const chosen = new Map<string, number[]>()
  for (const r of preview.rows) {
    const id = choice[r.row]
    if (id) chosen.set(id, [...(chosen.get(id) ?? []), r.row])
  }
  const twice = [...chosen.entries()].filter(([, rows]) => rows.length > 1)
  const notRemitted = live.filter((l) => !chosen.has(l._id))
  const open = preview.rows.filter((r) => r.status !== 'matched' && !choice[r.row])

  const apply = () => {
    if (twice.length) return setError(`Rows ${twice[0][1].join(' and ')} point to the same mutual assistance. Pick one for each row.`)
    const updates = preview.rows
      .filter((r) => choice[r.row] && r.amount !== null)
      .map((r) => {
        const line = live.find((l) => l._id === choice[r.row])!
        return { lineId: line._id, loanNo: line.loanNo, remitted: r.amount as number }
      })
    // Lines with no row in the file: nothing was remitted for them.
    for (const l of notRemitted) updates.push({ lineId: l._id, loanNo: l.loanNo, remitted: 0 })
    // Remember the sheet and columns for next time; filling in the form doesn't wait for it.
    api('/api/deductions/import-settings', { method: 'PUT', body: JSON.stringify({ sheet: preview.sheet, mapping: preview.mapping }) }).catch(() => {})
    onApply(updates)
  }

  const lineSelect = (r: Preview['rows'][number]) => {
    const firstIds = new Set(r.candidates.map((c) => c.lineId))
    return (
      <select className="input py-1 text-sm" aria-label={`Mutual assistance for row ${r.row}`} value={choice[r.row] ?? ''}
        onChange={(e) => { setChoice((c) => ({ ...c, [r.row]: e.target.value })); setError('') }}>
        <option value="">Not on this run (skip)</option>
        {r.candidates.length > 0 && (
          <optgroup label="Possible matches">
            {r.candidates.map((c) => <option key={c.lineId} value={c.lineId}>{c.borrowerName} · {c.loanNo}{c.memberId ? ` · UDEI ${c.memberId}` : ''}</option>)}
          </optgroup>
        )}
        <optgroup label="Every line on this run">
          {live.filter((l) => !firstIds.has(l._id)).map((l) => <option key={l._id} value={l._id}>{l.borrowerName} · {l.loanNo}</option>)}
        </optgroup>
      </select>
    )
  }

  const group = (title: string, Icon: typeof CheckCircle2, tone: string, rows: Preview['rows'], hint?: string) =>
    rows.length > 0 && (
      <div className="mt-4">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${tone}`}>
          <Icon className="h-4 w-4" /> {title} ({rows.length})
        </h3>
        {hint && <p className="text-xs text-brand-500">{hint}</p>}
        <div className="mt-2 overflow-x-auto rounded-lg border border-brand-100">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">In the file</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Mutual assistance</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {rows.map((r) => (
                <tr key={r.row} className="align-top">
                  <td className="px-3 py-2 text-brand-500 tabular-nums">{r.row}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-ink">{r.label}</span>
                    {r.employeeNo && r.label !== r.employeeNo && <span className="block text-xs text-brand-500">Employee no. {r.employeeNo}</span>}
                    {r.by && r.status === 'matched' && <span className="block text-xs text-emerald-700">Matched by {BY[r.by]}</span>}
                    {r.note && <span className="block text-xs text-amber-700">{r.note}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {r.amount === null ? <span className="text-red-700">“{r.amountText}” is not an amount</span> : formatCentavos(r.amount)}
                  </td>
                  <td className="min-w-56 px-3 py-2">{lineSelect(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )

  const usableSheets = preview.sheets.filter((s) => s.usable)
  return (
    <div className="mt-4 rounded-lg border border-brand-200 p-3 sm:p-4" role="region" aria-label="Remittance list review">
      <p className="flex flex-wrap items-center gap-2 text-sm text-brand-800">
        <FileSpreadsheet className="h-4 w-4" /> <b className="break-all">{preview.fileName}</b>
        <span className="text-brand-500">· sheet “{preview.sheet}”, headers on row {preview.headerRow}{preview.remembered ? ' · columns as remembered' : ''}</span>
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {usableSheets.length > 1 && (
          <div className="min-w-0">
            <label className="label" htmlFor="rp-sheet">Sheet</label>
            <select id="rp-sheet" className="input" value={preview.sheet} disabled={busy} onChange={(e) => onReread({ sheet: e.target.value })}>
              {usableSheets.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
        )}
        {preview.amountColumns.length > 1 && (
          <div className="min-w-0">
            <label className="label" htmlFor="rp-amount">Which column is the Mutual Assistance deduction?</label>
            <select id="rp-amount" className="input" value={preview.amountColumn} disabled={busy} onChange={(e) => onReread({ sheet: preview.sheet, amount: e.target.value })}>
              {preview.amountColumns.map((c) => <option key={c}>{c}</option>)}
            </select>
            {preview.pickAmountColumn && <p className="mt-1 text-xs text-amber-700">The list has more than one amount column. Check this one; it is remembered for next time.</p>}
          </div>
        )}
      </div>

      {group('Ambiguous: pick one', HelpCircle, 'text-amber-800', preview.rows.filter((r) => r.status === 'ambiguous'), 'More than one line on this run could be this row.')}
      {group('Not found', SearchX, 'text-red-700', preview.rows.filter((r) => r.status === 'not_found' || r.status === 'bad_amount'), 'No line on this run matches. Pick one if you know it, or leave it skipped.')}
      {group('Matched', CheckCircle2, 'text-emerald-800', preview.rows.filter((r) => r.status === 'matched'))}

      <div className="mt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800"><AlertTriangle className="h-4 w-4" /> Not remitted ({notRemitted.length})</h3>
        <p className="text-xs text-brand-500">Lines on this run with no row in the file. Applying sets them to ₱0.00; give each a reason before saving.</p>
        {notRemitted.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-brand-800">
            {notRemitted.map((l) => <li key={l._id}>{l.borrowerName} · {l.loanNo} · expected {formatCentavos(l.expected)}</li>)}
          </ul>
        )}
      </div>

      {open.length > 0 && <p className="mt-3 text-xs text-amber-700">{open.length} row{open.length === 1 ? '' : 's'} still skipped.</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={apply}>Apply to the lines</button>
      </div>
    </div>
  )
}
