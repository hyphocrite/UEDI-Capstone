import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { formatCutoff, runStatusLabel } from '../lib/deductions'
import type { DeductionRun, RunSummary } from '../lib/deductions'
import { formatCentavos } from '../lib/loans'

/** One payroll deduction run per cutoff (the 15th and the month-end). */
export default function DeductionsPage() {
  const confirm = useConfirm()
  const { session } = useAuth()
  const navigate = useNavigate()
  const canCreate = session?.role === 'bookkeeper' || session?.role === 'treasurer'
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [suggested, setSuggested] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [cutoff, setCutoff] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    api<{ runs: RunSummary[]; suggestedCutoff: string }>('/api/deductions')
      .then((d) => {
        setRuns(d.runs)
        setSuggested(d.suggestedCutoff)
      })
      .catch((err: unknown) => {
        setRuns([])
        setError(err instanceof Error ? err.message : 'Could not load the runs.')
      })
  }, [])

  const openNew = () => {
    setCutoff(suggested)
    setFormError('')
    setCreating(true)
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await confirm({
      title: 'Start this deduction run?',
      message: <p>Build the payroll deduction list for the <b>{formatCutoff(cutoff)}</b> cutoff from every loan with an installment due that day. There can only be one run per cutoff.</p>,
      confirmLabel: 'Yes, start it',
    })
    if (!ok) return
    setBusy(true)
    setFormError('')
    try {
      const { run } = await api<{ run: DeductionRun }>('/api/deductions', { method: 'POST', body: JSON.stringify({ cutoffDate: cutoff }) })
      navigate(`/deductions/${run._id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the run.')
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Payroll Deductions"
        subtitle="Each cutoff, send DNSC's Payroll Officer the list of installments to deduct, then record what payroll remitted."
        actions={canCreate && (
          <button className="btn-primary" onClick={openNew} disabled={!suggested}>
            <Plus className="h-4 w-4" /> New run
          </button>
        )}
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

      <div className="card min-w-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Cutoff</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Loans</th>
              <th className="px-4 py-3 text-right">Expected</th>
              <th className="px-4 py-3 text-right">Remitted</th>
              <th className="px-4 py-3 text-right">Missed or partial</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {runs?.map((r) => (
              <tr key={r._id} className="cursor-pointer hover:bg-brand-50/50" onClick={() => navigate(`/deductions/${r._id}`)}>
                <td className="px-4 py-3 font-semibold whitespace-nowrap text-ink">
                  <Link to={`/deductions/${r._id}`} onClick={(e) => e.stopPropagation()} className="hover:text-accent-dark">{formatCutoff(r.cutoff)}</Link>
                </td>
                <td className="px-4 py-3"><StatusBadge status={runStatusLabel[r.status]} /></td>
                <td className="px-4 py-3 text-right">{r.totals.lines}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatCentavos(r.totals.expected)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{r.status === 'draft' ? '—' : formatCentavos(r.totals.remitted)}</td>
                <td className={`px-4 py-3 text-right ${r.totals.missed + r.totals.partial > 0 && r.status !== 'draft' ? 'font-semibold text-red-700' : ''}`}>
                  {r.status === 'draft' ? '—' : r.totals.missed + r.totals.partial}
                </td>
              </tr>
            ))}
            {runs && runs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-500">No runs yet. Start one for the next cutoff.</td></tr>
            )}
            {!runs && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-500">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal title="New deduction run" open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={create} noValidate>
          <label className="label" htmlFor="cutoff">Cutoff date</label>
          <input id="cutoff" type="date" className="input" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          <p className="mt-1 text-xs text-brand-500">
            The 15th or the last day of a month. Suggested: {suggested ? formatCutoff(suggested) : '—'}, the next cutoff without a run.
          </p>
          {formError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{formError}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !cutoff}>{busy ? 'Building…' : 'Build the list'}</button>
          </div>
        </form>
      </Modal>
    </>
  )
}
