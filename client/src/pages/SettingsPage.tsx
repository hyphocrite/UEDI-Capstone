import { useEffect, useState } from 'react'
import { Building2, Percent, Plus, RotateCcw, Save, Wallet, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import UsersSection from '../components/settings/UsersSection'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { monthlyInstallment } from '../lib/applications'
import type { LoanType } from '../lib/applications'
import { formatDate, formatPeso } from '../lib/format'
import { fetchSettings, rememberSettings, useSettings } from '../lib/settings'
import type { LoanSettings } from '../lib/settings'

type Draft = {
  products: Record<LoanType, { label: string; monthlyRate: string; maxTermMonths: string }>
  minMonthlySalary: string
  branches: string[]
}

const toDraft = (s: LoanSettings): Draft => ({
  products: {
    long_term: { label: s.products.long_term.label, monthlyRate: String(s.products.long_term.monthlyRate), maxTermMonths: String(s.products.long_term.maxTermMonths) },
    emergency: { label: s.products.emergency.label, monthlyRate: String(s.products.emergency.monthlyRate), maxTermMonths: String(s.products.emergency.maxTermMonths) },
  },
  minMonthlySalary: String(s.minMonthlySalary),
  branches: [...s.branches],
})

const LOAN_TYPES: LoanType[] = ['long_term', 'emergency']

export default function SettingsPage() {
  const { session } = useAuth()
  const confirm = useConfirm()
  // Interest rates are set by the Administrator only; the server refuses rate changes from anyone else.
  const canSetRates = session?.role === 'admin'
  const { settings } = useSettings()
  const [saved, setSaved] = useState<LoanSettings | null>(null)
  const current = saved ?? settings
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings))
  const [newBranch, setNewBranch] = useState('')
  const [sample, setSample] = useState(50000)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Show the saved rules once they arrive.
  useEffect(() => {
    fetchSettings().then((s) => setDraft(toDraft(s))).catch(() => {})
  }, [])

  const touch = () => setMessage(null)
  const setProduct = (t: LoanType, key: 'monthlyRate' | 'maxTermMonths', value: string) => {
    touch()
    setDraft((d) => ({ ...d, products: { ...d.products, [t]: { ...d.products[t], [key]: value } } }))
  }
  const addBranch = () => {
    const b = newBranch.trim()
    if (!b || draft.branches.includes(b)) return
    touch()
    setDraft((d) => ({ ...d, branches: [...d.branches, b] }))
    setNewBranch('')
  }

  /** Each rule that differs from what is saved, as "what: old → new". */
  const changes = () => {
    const list: string[] = []
    for (const t of LOAN_TYPES) {
      const was = current.products[t]
      const now = draft.products[t]
      if (Number(now.monthlyRate) !== was.monthlyRate) list.push(`${was.label} rate: ${was.monthlyRate}% → ${now.monthlyRate}% a month`)
      if (Number(now.maxTermMonths) !== was.maxTermMonths) list.push(`${was.label} longest term: ${was.maxTermMonths} → ${now.maxTermMonths} months`)
    }
    if (Number(draft.minMonthlySalary) !== current.minMonthlySalary) {
      list.push(`Minimum monthly salary: ${formatPeso(current.minMonthlySalary)} → ${formatPeso(Number(draft.minMonthlySalary))}`)
    }
    const added = draft.branches.filter((b) => !current.branches.includes(b))
    const removed = current.branches.filter((b) => !draft.branches.includes(b))
    if (added.length) list.push(`Branches added: ${added.join(', ')}`)
    if (removed.length) list.push(`Branches removed: ${removed.join(', ')}`)
    return list
  }

  const save = async () => {
    const list = changes()
    if (!list.length) return setMessage({ tone: 'ok', text: 'Nothing has changed.' })
    const ok = await confirm({
      title: 'Save these loan rules?',
      message: (
        <>
          <ul className="list-disc space-y-1 pl-5">{list.map((c) => <li key={c}>{c}</li>)}</ul>
          <p>They apply to every new application from now on, on the web and in the member app. Applications already filed keep their terms.</p>
        </>
      ),
      confirmLabel: 'Yes, save',
    })
    if (!ok) return
    setSaving(true)
    try {
      const body = {
        products: Object.fromEntries(LOAN_TYPES.map((t) => [t, { label: draft.products[t].label, monthlyRate: Number(draft.products[t].monthlyRate), maxTermMonths: Number(draft.products[t].maxTermMonths) }])),
        minMonthlySalary: Number(draft.minMonthlySalary),
        branches: draft.branches,
      }
      const { settings: next } = await api<{ settings: LoanSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(body) })
      rememberSettings(next)
      setSaved(next)
      setDraft(toDraft(next))
      setMessage({ tone: 'ok', text: 'Saved. New applications, on the web and in the member app, now use these rules.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save the settings.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Loan Settings"
        subtitle={session?.role === 'admin'
          ? 'Interest rates, terms and the minimum salary for Mutual Assistance loans, and who can sign loans.'
          : 'Interest rates, terms and the minimum salary for Mutual Assistance loans.'}
        actions={
          <>
            <button className="btn-ghost" onClick={() => { touch(); setDraft(toDraft(current)) }}><RotateCcw className="h-4 w-4" /> Undo changes</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />

      {message && (
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      <div className="card min-w-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Loan type</th>
              <th className="px-4 py-3">Interest (% per month){canSetRates ? '' : <span className="block font-normal normal-case">Administrator only</span>}</th>
              <th className="px-4 py-3">Longest term (months)</th>
              <th className="px-4 py-3 text-right">Monthly installment on {formatPeso(sample)}, longest term</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {LOAN_TYPES.map((t) => {
              const p = draft.products[t]
              const months = Math.max(1, Math.round(Number(p.maxTermMonths) || 1))
              const inst = monthlyInstallment({ amount: sample, termMonths: months, monthlyRate: Number(p.monthlyRate) || 0 })
              return (
                <tr key={t}>
                  <td className="px-4 py-3 font-semibold text-ink">
                    <span className="flex items-center gap-2"><Percent className="h-4 w-4 text-accent" />{p.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={0} max={10} step={0.25} className={`input w-28 ${canSetRates ? '' : 'cursor-not-allowed bg-brand-50'}`} value={p.monthlyRate}
                      readOnly={!canSetRates} title={canSetRates ? undefined : 'Only the Administrator can change interest rates.'}
                      onChange={(e) => setProduct(t, 'monthlyRate', e.target.value)} aria-label={`${p.label} interest rate`} />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={1} max={120} step={1} className="input w-28" value={p.maxTermMonths}
                      onChange={(e) => setProduct(t, 'maxTermMonths', e.target.value)} aria-label={`${p.label} longest term`} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatPeso(Math.round(inst))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex flex-col gap-3 border-t border-brand-100 p-4 sm:flex-row sm:items-center">
          <label htmlFor="sample" className="text-sm font-medium text-brand-800">Preview with a loan of</label>
          <input id="sample" type="number" min={0} step={1000} className="input sm:w-40" value={sample}
            onChange={(e) => setSample(Math.max(0, Number(e.target.value) || 0))} />
          <p className="text-xs text-brand-500">Interest is charged on the remaining balance each month, as in UDEI's ledger.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-800"><Wallet className="h-5 w-5 text-accent" /> Minimum monthly salary</h2>
          <p className="mt-1 text-sm text-brand-600">Applications from members earning less are refused, on the web and in the member app.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-700">₱</span>
            <input type="number" min={0} step={500} className="input w-40" value={draft.minMonthlySalary} aria-label="Minimum monthly salary"
              onChange={(e) => { touch(); setDraft((d) => ({ ...d, minMonthlySalary: e.target.value })) }} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-800"><Building2 className="h-5 w-5 text-accent" /> Branches and offices</h2>
          <p className="mt-1 text-sm text-brand-600">Shown on sign-up, profiles and member records.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {draft.branches.map((b) => (
              <li key={b} className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm text-brand-800">
                {b}
                <button className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${b}`}
                  onClick={() => { touch(); setDraft((d) => ({ ...d, branches: d.branches.filter((x) => x !== b) })) }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className="input" value={newBranch} maxLength={120} placeholder="Add a branch or office" aria-label="New branch"
              onChange={(e) => setNewBranch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addBranch())} />
            <button className="btn-ghost shrink-0" onClick={addBranch}><Plus className="h-4 w-4" /> Add</button>
          </div>
        </section>
      </div>

      {current.updatedAt && (
        <p className="mt-3 text-xs text-brand-500">Last saved {formatDate(current.updatedAt)}{current.updatedByName ? ` by ${current.updatedByName}` : ''}.</p>
      )}

      {session?.role === 'admin' && <UsersSection />}
    </>
  )
}
