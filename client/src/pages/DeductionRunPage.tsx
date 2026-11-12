import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCheck, Download, Printer, Save, Send, Undo2 } from 'lucide-react'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import StatusBadge from '../components/StatusBadge'
import PrintSheet from '../components/deductions/PrintSheet'
import RemittancePanel from '../components/deductions/RemittancePanel'
import type { RemittanceEdit } from '../components/deductions/RemittancePanel'
import RunLinesTable from '../components/deductions/RunLinesTable'
import type { LineEdit } from '../components/deductions/RunLinesTable'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { formatCutoff, lineResult, runStatusLabel } from '../lib/deductions'
import type { DeductionRun, ImportResult, RunLine } from '../lib/deductions'
import { formatCentavos, formatDay, toCentavos } from '../lib/loans'

const editsFrom = (run: DeductionRun): Record<string, LineEdit> =>
  Object.fromEntries(run.lines.map((l) => [l._id, { remitted: String((l.remitted ?? l.expected) / 100), reason: l.reason ?? '', reasonNote: l.reasonNote ?? '' }]))

const remittanceFrom = (run: DeductionRun): RemittanceEdit => ({
  officialReceiptNo: run.remittance?.officialReceiptNo ?? '',
  amountReceived: run.remittance?.amountReceived !== undefined ? String(run.remittance.amountReceived / 100) : '',
  receivedAt: run.remittance?.receivedAt?.slice(0, 10) ?? '',
})

type Prompt = { kind: 'remove'; line: RunLine } | { kind: 'unpost' }

export default function DeductionRunPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const confirm = useConfirm()
  const canWrite = session?.role === 'bookkeeper' || session?.role === 'treasurer'
  const [run, setRunState] = useState<DeductionRun | null>(null)
  const [edits, setEdits] = useState<Record<string, LineEdit>>({})
  const [remittance, setRemittance] = useState<RemittanceEdit>({ officialReceiptNo: '', amountReceived: '', receivedAt: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [reason, setReason] = useState('')

  const setRun = useCallback((r: DeductionRun) => {
    setRunState(r)
    setEdits(editsFrom(r))
    setRemittance(remittanceFrom(r))
  }, [])

  useEffect(() => {
    api<{ run: DeductionRun }>(`/api/deductions/${id}`)
      .then((d) => setRun(d.run))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the run.'))
  }, [id, setRun])

  // Live totals while the remitted amounts are being typed.
  const live = useMemo(() => {
    const lines = (run?.lines ?? []).filter((l) => !l.removed)
    if (run?.status !== 'sent') return run?.totals
    let remitted = 0
    let missed = 0
    let partial = 0
    for (const l of lines) {
      const e = edits[l._id]
      const r = e ? toCentavos(e.remitted || 0) : (l.remitted ?? l.expected)
      remitted += r
      const res = lineResult(l.expected, r, e?.reason)
      if (res === 'missed') missed++
      if (res === 'partial') partial++
    }
    return { ...run.totals, remitted, missed, partial }
  }, [run, edits])

  const act = async (label: string, fn: () => Promise<{ run: DeductionRun }>, done?: string) => {
    setBusy(label)
    setError('')
    setNotice('')
    try {
      const r = await fn()
      setRun(r.run)
      if (done) setNotice(done)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      return false
    } finally {
      setBusy(null)
    }
  }

  if (!run) {
    return (
      <>
        <PageHeader title="Payroll deduction run" actions={<Link to="/deductions" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> All runs</Link>} />
        {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : <p className="text-sm text-brand-500">Loading…</p>}
      </>
    )
  }

  const path = `/api/deductions/${run._id}`
  const cutoffName = formatCutoff(run.cutoff)
  const patchLine = async (line: RunLine, body: { expected?: number; remove?: boolean; removedReason?: string }) => {
    const who = <b>{line.loanNo} · {line.borrowerName}</b>
    const ok = await confirm(
      body.remove
        ? { title: 'Remove this line?', message: <p>Take {who} off the {cutoffName} list. Payroll won't deduct for this loan this cutoff. Reason: “{body.removedReason}”.</p>, confirmLabel: 'Yes, remove', danger: true }
        : body.remove === false
          ? { title: 'Put this line back?', message: <p>Put {who} back on the {cutoffName} list.</p>, confirmLabel: 'Yes, put back' }
          : { title: 'Change the amount?', message: <p>Ask payroll to deduct <b>{formatCentavos(body.expected ?? 0)}</b> instead of {formatCentavos(line.expected)} from {who} on {cutoffName}.</p>, confirmLabel: 'Yes, change it' },
    )
    if (!ok) return false
    return act('line', () => api(`${path}/lines/${line._id}`, { method: 'PATCH', body: JSON.stringify(body) }))
  }

  const missingReason = run.lines.find((l) => {
    const e = edits[l._id]
    if (l.removed || !e) return false
    const r = toCentavos(e.remitted || 0)
    return (r < l.expected && !e.reason) || (e.reason === 'other' && !e.reasonNote.trim())
  })
  const save = async (askFirst = true) => {
    if (missingReason) {
      setError(`${missingReason.loanNo} (${missingReason.borrowerName}): less than the amount sent was deducted. Choose a reason.`)
      return false
    }
    if (askFirst && !(await confirm({
      title: 'Save the remitted amounts?',
      message: <p>Save what payroll remitted for the {cutoffName} run: {formatCentavos(live?.remitted ?? 0)} in total. Nothing is posted to the loans until you post the run.</p>,
      confirmLabel: 'Yes, save',
    }))) return false
    return act('save', () =>
      api(`${path}/remittance`, {
        method: 'PUT',
        body: JSON.stringify({
          remittance: {
            officialReceiptNo: remittance.officialReceiptNo.trim() || undefined,
            amountReceived: remittance.amountReceived === '' ? undefined : toCentavos(remittance.amountReceived),
            receivedAt: remittance.receivedAt || undefined,
          },
          lines: run.lines.filter((l) => !l.removed).map((l) => ({ lineId: l._id, remitted: toCentavos(edits[l._id]?.remitted || 0), reason: edits[l._id]?.reason || undefined, reasonNote: edits[l._id]?.reasonNote || undefined })),
        }),
      }), 'Saved.')
  }
  const post = async () => {
    const ok = await confirm({
      title: 'Post this run to the ledger?',
      message: (
        <>
          <p>Each remitted amount on the {cutoffName} run becomes a payroll payment on its loan ({formatCentavos(live?.remitted ?? 0)} in total), and missed or partial deductions are flagged on the loans.</p>
          <p>Only the Treasurer can undo this, by unposting the run.</p>
        </>
      ),
      confirmLabel: 'Yes, post',
    })
    if (!ok || !(await save(false))) return
    await act('post', () => api(`${path}/post`, { method: 'POST' }), 'Posted. Each remitted amount is now a payroll payment on its loan.')
  }
  const applyImport = (updates: ImportResult['updates']) =>
    setEdits((all) => {
      const next = { ...all }
      for (const u of updates) if (u.lineId && next[u.lineId]) next[u.lineId] = { ...next[u.lineId], remitted: String(u.remitted / 100) }
      return next
    })

  const confirmPrompt = async () => {
    if (!prompt) return
    if (reason.trim().length < 3) return setError('Give a reason.')
    if (prompt.kind !== 'remove' && !(await confirm({
      title: 'Unpost this run?',
      message: <p>Every payment this run posted is voided and the loan balances go back up, so the {cutoffName} lines can be corrected and posted again. Reason: “{reason.trim()}”.</p>,
      confirmLabel: 'Yes, unpost',
      danger: true,
    }))) return
    const ok = prompt.kind === 'remove'
      ? await patchLine(prompt.line, { remove: true, removedReason: reason.trim() })
      : await act('unpost', () => api(`${path}/unpost`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }), 'Unposted. The run’s payments were voided; correct the lines and post again.')
    if (ok) {
      setPrompt(null)
      setReason('')
    }
  }

  const t = live ?? run.totals
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Payroll deductions, ${formatCutoff(run.cutoff)}`}
          subtitle={`${runStatusLabel[run.status]}${run.sentByName ? ` · sent by ${run.sentByName}` : ''}${run.postedByName ? ` · posted by ${run.postedByName}` : ''}`}
          actions={
            <>
              <Link to="/deductions" className="btn-ghost"><ArrowLeft className="h-4 w-4" /> All runs</Link>
              {run.status !== 'draft' && <a className="btn-ghost" href={`${path}/export.csv`} download><Download className="h-4 w-4" /> Download CSV</a>}
              {run.status !== 'draft' && <button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>}
            </>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={runStatusLabel[run.status]} />
          {run.unposts && run.unposts.length > 0 && (
            <span className="text-xs text-brand-600">Unposted {run.unposts.length}×, last: “{run.unposts[run.unposts.length - 1].reason}”</span>
          )}
        </div>

        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Members" value={String(t.members)} />
          <Stat label="Expected" value={formatCentavos(t.expected)} />
          <Stat label="Remitted" value={run.status === 'draft' ? '—' : formatCentavos(t.remitted)} />
          <Stat label="Missed / partial" value={run.status === 'draft' ? '—' : `${t.missed} / ${t.partial}`} warn={run.status !== 'draft' && t.missed + t.partial > 0} />
        </dl>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}

        <div className="space-y-6">
          {run.status === 'sent' && canWrite && (
            <RemittancePanel runId={run._id} value={remittance} onChange={(p) => setRemittance((r) => ({ ...r, ...p }))} totalRemitted={t.remitted} onImported={applyImport} />
          )}

          <section className="card min-w-0">
            <h2 className="border-b border-brand-100 px-4 py-3 font-semibold text-brand-800 sm:px-5">
              {run.status === 'draft' ? 'Lines to send' : run.status === 'sent' ? 'What was deducted' : 'Posted lines'}
            </h2>
            {run.lines.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-500 sm:px-5">No active loans have an installment due on this cutoff.</p>
            ) : (
              <RunLinesTable
                mode={run.status}
                lines={run.lines}
                edits={edits}
                canEdit={canWrite}
                onEdit={(lineId, patch) => setEdits((all) => ({ ...all, [lineId]: { ...all[lineId], ...patch } }))}
                onExpected={(line, c) => void patchLine(line, { expected: c })}
                onRemove={(line) => { setReason(''); setPrompt({ kind: 'remove', line }) }}
                onRestore={(line) => void patchLine(line, { remove: false })}
              />
            )}
          </section>

          {canWrite && run.status === 'draft' && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-xs text-brand-500">Sending locks the amounts. Then download the CSV or print the list for the Payroll Officer.</p>
              <button className="btn-primary" disabled={busy !== null} onClick={async () => {
                if (!(await confirm({
                  title: 'Send this run to payroll?',
                  message: <p>Lock the {cutoffName} list: {run.lines.filter((l) => !l.removed).length} lines, {formatCentavos(t.expected)} to deduct. The amounts can't be changed after this.</p>,
                  confirmLabel: 'Yes, send',
                }))) return
                await act('send', () => api(`${path}/send`, { method: 'POST' }), 'Sent. Download the CSV or print the list for DNSC payroll.')
              }}>
                <Send className="h-4 w-4" /> {busy === 'send' ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
          {canWrite && run.status === 'sent' && (
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-ghost" disabled={busy !== null} onClick={() => void save()}><Save className="h-4 w-4" /> {busy === 'save' ? 'Saving…' : 'Save'}</button>
              <button className="btn-accent" disabled={busy !== null} onClick={() => void post()}><CheckCheck className="h-4 w-4" /> {busy === 'post' ? 'Posting…' : 'Post to the ledger'}</button>
            </div>
          )}
          {run.status === 'posted' && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="text-xs text-brand-600">
                Posted {run.postedAt ? formatDay(run.postedAt) : ''}. O.R. {run.remittance?.officialReceiptNo}, {formatCentavos(run.remittance?.amountReceived ?? 0)} received.
              </p>
              {session?.role === 'treasurer' && (
                <button className="btn-ghost text-red-700" onClick={() => { setReason(''); setPrompt({ kind: 'unpost' }) }}><Undo2 className="h-4 w-4" /> Unpost</button>
              )}
            </div>
          )}
        </div>
      </div>

      <PrintSheet run={run} />

      <Modal title={prompt?.kind === 'unpost' ? 'Unpost this run?' : `Remove ${prompt?.kind === 'remove' ? prompt.line.borrowerName : ''}?`} open={prompt !== null} onClose={() => setPrompt(null)}>
        <p className="text-sm text-brand-700">
          {prompt?.kind === 'unpost'
            ? 'Every payment this run posted is voided (kept on record) and the run goes back to “sent” so it can be corrected and posted again.'
            : 'The line stays on record, marked removed, and is left off the list sent to payroll.'}
        </p>
        <label className="label mt-4" htmlFor="promptReason">Reason</label>
        <textarea id="promptReason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setPrompt(null)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void confirmPrompt()}>
            {prompt?.kind === 'unpost' ? 'Unpost' : 'Remove line'}
          </button>
        </div>
      </Modal>
    </>
  )
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card min-w-0 p-3 sm:p-4">
      <dt className="text-xs text-brand-500">{label}</dt>
      <dd className={`truncate text-lg font-bold ${warn ? 'text-red-700' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
