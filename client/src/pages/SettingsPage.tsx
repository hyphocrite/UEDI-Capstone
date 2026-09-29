import { useState } from 'react'
import { Percent, RotateCcw, Save } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { interestRates as defaults } from '../data/mock'
import type { InterestRate } from '../data/mock'
import { formatPeso } from '../lib/format'
import { loadRates, RATES_STORAGE_KEY } from '../lib/interestRates'

type Field = 'annualRate' | 'maxTermMonths' | 'serviceFee' | 'penaltyRate'

export default function SettingsPage() {
  const [rates, setRates] = useState<InterestRate[]>(loadRates)
  const [saved, setSaved] = useState(false)
  const [sample, setSample] = useState(50000)

  const update = (id: string, field: Field, value: string) => {
    setSaved(false)
    const n = value === '' ? 0 : Number(value)
    if (Number.isNaN(n) || n < 0) return
    setRates((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: n } : r)))
  }

  const save = () => {
    try {
      localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates))
    } catch {
      /* storage may be blocked */
    }
    setSaved(true)
  }

  const reset = () => {
    setRates(defaults)
    setSaved(false)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Interest rates and fees used for each loan product."
        actions={
          <>
            <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</button>
            <button className="btn-primary" onClick={save}><Save className="h-4 w-4" /> Save changes</button>
          </>
        }
      />

      {saved && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800" role="status">
          Interest rates saved on this device. They will be stored in the database once settings are connected.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Loan product</th>
              <th className="px-4 py-3">Interest rate (% per year)</th>
              <th className="px-4 py-3">Max term (months)</th>
              <th className="px-4 py-3">Service fee (%)</th>
              <th className="px-4 py-3">Late penalty (% per month)</th>
              <th className="px-4 py-3 text-right">Total on {formatPeso(sample)}, max term</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {rates.map((r) => {
              const total = sample * (1 + (r.annualRate / 100) * (r.maxTermMonths / 12))
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <span className="flex items-center gap-2"><Percent className="h-4 w-4 text-accent" />{r.product}</span>
                  </td>
                  {(['annualRate', 'maxTermMonths', 'serviceFee', 'penaltyRate'] as Field[]).map((f) => (
                    <td key={f} className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={f === 'maxTermMonths' ? 1 : 0.25}
                        className="input w-28"
                        value={r[f]}
                        onChange={(e) => update(r.id, f, e.target.value)}
                        aria-label={`${r.product} ${f}`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold">{formatPeso(Math.round(total))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <label htmlFor="sample" className="text-sm font-medium text-brand-800">Preview with a loan amount of</label>
        <input id="sample" type="number" min={0} step={1000} className="input sm:w-40" value={sample}
          onChange={(e) => setSample(Math.max(0, Number(e.target.value) || 0))} />
        <p className="text-xs text-brand-500">Uses add-on interest over the maximum term. UEDI's exact formula can replace this.</p>
      </div>
    </>
  )
}
