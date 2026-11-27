import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HelpCircle, SearchX } from 'lucide-react'
import Pagination from '../Pagination'
import TableShell from '../TableShell'
import { api } from '../../lib/api'
import { usePaged } from '../../lib/usePaged'
import type { RemittancePreview as Preview, RunLine } from '../../lib/deductions'
import { formatCentavos } from '../../lib/loans'

const BY: Record<string, string> = { loan_no: 'MA no.', member_no: 'UDEI no.', employee_no: 'employee no.', name: 'name' }

type Row = Preview['rows'][number]
/** Rows that need a choice come first: ambiguous, then not found, then matched (each in file order). */
const ORDER: Record<Row['status'], number> = { ambiguous: 0, not_found: 1, bad_amount: 1, matched: 2 }
const STATUS: Record<Row['status'], { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  ambiguous: { label: 'Pick one', tone: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: HelpCircle },
  not_found: { label: 'Not found', tone: 'bg-red-50 text-red-700 ring-red-200', Icon: SearchX },
  bad_amount: { label: 'Not found', tone: 'bg-red-50 text-red-700 ring-red-200', Icon: SearchX },
  matched: { label: 'Matched', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Icon: CheckCircle2 },
}

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
  const [needsOnly, setNeedsOnly] = useState(false)
  const [allNotRemitted, setAllNotRemitted] = useState(false)
  const ordered = useMemo(
    () => [...preview.rows].filter((r) => !needsOnly || r.status !== 'matched').sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.row - b.row),
    [preview.rows, needsOnly],
  )
  const paged = usePaged(ordered, { resetKey: needsOnly })
  const count = (s: Row['status'][]) => preview.rows.filter((r) => s.includes(r.status)).length
  const needCount = count(['ambiguous', 'not_found', 'bad_amount'])

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

  const lineSelect = (r: Row) => {
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

  const rowsTable = (
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="text-amber-800">{count(['ambiguous'])} to pick</span>
            <span className="text-red-700">{count(['not_found', 'bad_amount'])} not found</span>
            <span className="text-emerald-800">{count(['matched'])} matched</span>
          </p>
          {needCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-brand-700 sm:ml-auto">
              <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} /> Needs a match only
            </label>
          )}
        </div>
        <p className="text-xs text-brand-500">Rows that need a choice are listed first. Pick a line for an ambiguous or not-found row if you know it, or leave it skipped.</p>
        <div className="mt-2 overflow-hidden rounded-lg border border-brand-100">
          <TableShell caption="Rows in the remittance list" anchor={paged.anchor}
            footer={<Pagination page={paged.page} pageSize={paged.perPage} total={paged.total} onPage={paged.setPage} />}>
            <thead className="table-head">
              <tr><th>Row</th><th>In the file</th><th className="text-right">Amount</th><th className="w-32">Status</th><th>Mutual assistance</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-50">
              {paged.pageRows.map((r) => {
                const st = STATUS[r.status]
                return (
                <tr key={r.row}>
                  <td className="cell text-brand-500 tabular-nums">{r.row}</td>
                  <td className="cell">
                    <span className="line-clamp-2 font-semibold text-ink">{r.label}</span>
                    {r.employeeNo && r.label !== r.employeeNo && <span className="block text-xs text-brand-500">Employee no. {r.employeeNo}</span>}
                    {r.by && r.status === 'matched' && <span className="block text-xs text-emerald-700">Matched by {BY[r.by]}</span>}
                    {r.note && <span className="block text-xs text-amber-700">{r.note}</span>}
                  </td>
                  <td className="cell-num">
                    {r.amount === null ? <span className="text-red-700">“{r.amountText}” is not an amount</span> : formatCentavos(r.amount)}
                  </td>
                  <td className="cell">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset ${st.tone}`}>
                      <st.Icon className="h-3 w-3" /> {st.label}
                    </span>
                  </td>
                  <td className="cell min-w-56">{lineSelect(r)}</td>
                </tr>
                )
              })}
              {paged.total === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-500">Every row is matched.</td></tr>}
            </tbody>
          </TableShell>
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

      {preview.rows.length > 0 && rowsTable}

      <div className="mt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800"><AlertTriangle className="h-4 w-4" /> Not remitted ({notRemitted.length})</h3>
        <p className="text-xs text-brand-500">Lines on this run with no row in the file. Applying sets them to ₱0.00; give each a reason before saving.</p>
        {notRemitted.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-brand-800">
            {(allNotRemitted ? notRemitted : notRemitted.slice(0, 10)).map((l) => <li key={l._id}>{l.borrowerName} · {l.loanNo} · expected {formatCentavos(l.expected)}</li>)}
          </ul>
        )}
        {notRemitted.length > 10 && (
          <button type="button" className="mt-1 text-xs font-semibold text-accent-dark hover:underline" onClick={() => setAllNotRemitted((v) => !v)}>
            {allNotRemitted ? 'Show the first 10' : `Show all ${notRemitted.length}`}
          </button>
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
