import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { employmentStatusLabel } from '../../lib/applications'
import type { LoanApplication } from '../../lib/applications'
import { formatDate, formatPeso } from '../../lib/format'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'

const BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * A supporting document next to what was typed on the form, for checking one against the other.
 * The file is fetched with the session cookie and shown from memory (never a public link).
 */
export default function DocumentViewer({ app, index, onIndex, onClose }: {
  app: LoanApplication
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const doc = app.documents[index]
  const viewable = app.documents.map((d, i) => (d.fileId ? i : -1)).filter((i) => i >= 0)
  const pos = viewable.indexOf(index)
  const [file, setFile] = useState<{ key: number; url: string; type: string } | null>(null)
  const [error, setError] = useState<{ key: number; text: string } | null>(null)

  useEffect(() => {
    let url = ''
    let cancelled = false
    fetch(`${BASE}/api/applications/${app._id}/documents/${index}/file`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || 'Could not open the file.', res.status)
        const blob = await res.blob()
        url = URL.createObjectURL(blob)
        if (!cancelled) setFile({ key: index, url, type: blob.type })
      })
      .catch((err: unknown) => !cancelled && setError({ key: index, text: err instanceof Error ? err.message : 'Could not open the file.' }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [app._id, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && pos < viewable.length - 1) onIndex(viewable[pos + 1])
      if (e.key === 'ArrowLeft' && pos > 0) onIndex(viewable[pos - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onIndex, pos, viewable])

  const a = app.applicant
  const shown = file?.key === index ? file : null
  const failed = error?.key === index ? error.text : ''
  const label = doc.type ? documentType(doc.type as DocumentTypeId)?.label ?? doc.type : 'Document'
  const rows: [string, string][] = [
    ['Name', a.fullName],
    ['Member ID', a.memberId || '—'],
    ['Residence address', a.residenceAddress],
    ['Employer', a.employer],
    ['Employment status', employmentStatusLabel[a.employmentStatus] ?? a.employmentStatus],
    ['Monthly salary', formatPeso(a.monthlySalary)],
    ['Net take-home pay', formatPeso(a.netTakeHomePay)],
    ['Date of birth', a.dateOfBirth ? formatDate(a.dateOfBirth) : '—'],
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={`${label}: ${doc.fileName}`}>
      <div className="flex items-center justify-between gap-2 rounded-t-xl bg-white px-4 py-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-semibold text-brand-800">{label}</span>
          <span className="text-brand-500"> · {doc.fileName}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button className="rounded p-1.5 text-brand-700 hover:bg-brand-50 disabled:opacity-30" disabled={pos <= 0} onClick={() => onIndex(viewable[pos - 1])} aria-label="Previous document">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-xs text-brand-600 tabular-nums">{pos + 1} of {viewable.length}</span>
          <button className="rounded p-1.5 text-brand-700 hover:bg-brand-50 disabled:opacity-30" disabled={pos >= viewable.length - 1} onClick={() => onIndex(viewable[pos + 1])} aria-label="Next document">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button className="ml-2 rounded p-1.5 text-brand-700 hover:bg-brand-50" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-b-xl bg-white lg:grid-cols-[1fr_22rem]">
        <div className="flex min-h-[45vh] items-center justify-center overflow-auto bg-brand-50">
          {failed ? (
            <p className="p-6 text-sm text-red-700">{failed}</p>
          ) : !shown ? (
            <p className="text-sm text-brand-500">Opening the file…</p>
          ) : shown.type === 'application/pdf' ? (
            <iframe title={doc.fileName} src={shown.url} className="h-full min-h-[45vh] w-full" />
          ) : (
            <img src={shown.url} alt={`${label} uploaded by the applicant`} className="max-h-full max-w-full object-contain" />
          )}
        </div>

        <aside className="min-h-0 overflow-y-auto border-t border-brand-100 p-4 lg:border-t-0 lg:border-l">
          <h3 className="text-xs font-semibold tracking-wide text-brand-600 uppercase">On the form</h3>
          <dl className="mt-2 space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-brand-500">{k}</dt>
                <dd className="font-medium break-words text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-5 text-xs font-semibold tracking-wide text-brand-600 uppercase">Automatic check</h3>
          <p className={`mt-1 text-sm font-semibold ${doc.verdict === 'verified' ? 'text-emerald-700' : doc.verdict === 'review' ? 'text-amber-700' : 'text-red-700'}`}>
            {doc.verdict === 'verified' ? 'Matches the form' : doc.verdict === 'review' ? 'Needs a look' : doc.verdict === 'mismatch' ? "Doesn't match the form" : doc.verdict === 'unreadable' ? 'Could not be read' : 'Not checked'}
          </p>
          {doc.notes?.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-brand-700">{doc.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          ) : null}
          <p className="mt-4 text-xs text-brand-500">Use the arrow keys to move between documents, Esc to close.</p>
        </aside>
      </div>
    </div>
  )
}
