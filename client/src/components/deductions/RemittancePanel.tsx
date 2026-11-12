import { useRef, useState } from 'react'
import { AlertTriangle, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import type { ImportResult } from '../../lib/deductions'
import { formatCentavos, toCentavos } from '../../lib/loans'

/** The O.R. for what payroll remitted. Amounts are pesos as typed. */
export type RemittanceEdit = { officialReceiptNo: string; amountReceived: string; receivedAt: string }

type Props = {
  runId: string
  value: RemittanceEdit
  onChange: (patch: Partial<RemittanceEdit>) => void
  totalRemitted: number
  onImported: (updates: ImportResult['updates']) => void
}

/** Remittance details, the remitted-vs-received check, and importing remitted amounts from payroll's CSV. */
export default function RemittancePanel({ runId, value, onChange, totalRemitted, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [report, setReport] = useState<{ applied: number; problems: ImportResult['problems'] } | null>(null)
  const [error, setError] = useState('')
  const received = value.amountReceived === '' ? null : toCentavos(value.amountReceived)
  const differs = received !== null && received !== totalRemitted

  const importFile = async (file: File) => {
    setImporting(true)
    setError('')
    setReport(null)
    try {
      const csv = await file.text()
      const result = await api<ImportResult>(`/api/deductions/${runId}/import`, { method: 'POST', body: JSON.stringify({ csv }) })
      onImported(result.updates)
      setReport({ applied: result.updates.length, problems: result.problems })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-semibold text-brand-800">What payroll remitted</h2>
      <p className="mt-1 text-sm text-brand-600">
        Every line starts at the amount sent, so only the exceptions need typing. Lines below that amount need a reason.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor="orNo">O.R. number</label>
          <input id="orNo" className="input" maxLength={40} value={value.officialReceiptNo} onChange={(e) => onChange({ officialReceiptNo: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="amountReceived">Amount received (₱)</label>
          <input id="amountReceived" type="number" min={0} step="0.01" inputMode="decimal" className="input" value={value.amountReceived}
            onChange={(e) => onChange({ amountReceived: e.target.value })} />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="receivedAt">Date received</label>
          <input id="receivedAt" type="date" className="input" value={value.receivedAt} onChange={(e) => onChange({ receivedAt: e.target.value })} />
        </div>
      </div>

      <p className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${differs ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-brand-800'}`} role={differs ? 'alert' : undefined}>
        {differs && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
          Lines add up to <strong>{formatCentavos(totalRemitted)}</strong>
          {received !== null && <>; the O.R. says <strong>{formatCentavos(received)}</strong></>}.
          {differs && ' They differ. Check the lines against payroll’s list before posting.'}
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload className="h-4 w-4" /> {importing ? 'Reading…' : 'Import remitted amounts (CSV)'}
        </button>
        <span className="text-xs text-brand-500">Same columns as the list sent to payroll, plus a “Remitted” column. Matched by loan no.</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ''
          }} />
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {report && (
        <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="status">
          Filled in {report.applied} line{report.applied === 1 ? '' : 's'} from the file. Review them, then save.
          {report.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-800">
              {report.problems.map((p) => <li key={`${p.row}-${p.loanNo}`}>Row {p.row}: {p.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
