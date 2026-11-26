import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import Modal from './Modal'
import { downloadFile } from '../lib/api'

/**
 * "Export individual ledger (Excel)": UDEI's INDIV. LEDGER sheet for a year, for every member, or
 * for one (memberId), with a year picker. For the Bookkeeper, the Treasurer and up.
 */
export default function LedgerExportButton({ memberId, label = 'Export individual ledger (Excel)' }: { memberId?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => String(new Date().getFullYear()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async () => {
    if (!/^\d{4}$/.test(year)) return setError('Enter the year.')
    setBusy(true)
    setError('')
    try {
      const q = new URLSearchParams({ year, ...(memberId ? { memberId } : {}) })
      await downloadFile(`/api/loans/ledger.xlsx?${q}`, `UDEI-Individual-Ledger-${year}${memberId ? `-${memberId}` : ''}.xlsx`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the ledger.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => { setError(''); setOpen(true) }}><FileSpreadsheet className="h-4 w-4" /> {label}</button>
      <Modal title={memberId ? `Ledger of member ${memberId}` : 'Export individual ledger'} open={open} onClose={() => setOpen(false)}>
        <p className="text-sm text-brand-700">
          UDEI's INDIV. LEDGER layout: {memberId ? 'this member' : 'one block per member'} with the January balance, each month's payment,
          1% service fee, net pay, interest, principal and balance, and the total.
        </p>
        <label className="label mt-4" htmlFor="ledger-year">Year</label>
        <input id="ledger-year" type="number" min={2000} max={2100} className="input" value={year} onChange={(e) => setYear(e.target.value)} />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={go}><FileSpreadsheet className="h-4 w-4" /> {busy ? 'Preparing…' : 'Download'}</button>
        </div>
      </Modal>
    </>
  )
}
