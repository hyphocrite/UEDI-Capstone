import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Loader2, Trash2, XCircle } from 'lucide-react'
import { DOCUMENT_TYPES, documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'
import type { DocumentAnalysis, DocumentVerdict } from '../../lib/ocr/analyzeDocument'
import type { ExtractedText } from '../../lib/ocr/textExtract'
import { formatPeso } from '../../lib/format'

export type UploadedDocument = {
  key: string
  file: File
  previewUrl: string | null
  hash: string | null
  status: 'reading' | 'done' | 'error'
  progress: number
  extracted: ExtractedText | null
  typeOverride: DocumentTypeId | null
  error: string | null
  duplicateOf: string | null
}

const verdictStyle: Record<DocumentVerdict, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  verified: { label: 'Verified', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  review: { label: 'Needs review', className: 'bg-amber-50 text-amber-700 ring-amber-200', Icon: AlertTriangle },
  mismatch: { label: 'Mismatch', className: 'bg-red-50 text-red-700 ring-red-200', Icon: XCircle },
  unreadable: { label: 'Unreadable', className: 'bg-gray-100 text-gray-600 ring-gray-200', Icon: XCircle },
}

const checkIcon = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-red-600" />,
}

type Props = {
  doc: UploadedDocument
  analysis: DocumentAnalysis | null
  onTypeChange: (type: DocumentTypeId | null) => void
  onRemove: () => void
}

export default function DocumentCard({ doc, analysis, onTypeChange, onRemove }: Props) {
  const [showText, setShowText] = useState(false)
  const verdict = doc.status === 'error' ? verdictStyle.unreadable : analysis ? verdictStyle[analysis.verdict] : null

  return (
    <article className="card overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-100 bg-brand-50">
          {doc.previewUrl ? (
            <img src={doc.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <FileText className="h-8 w-8 text-brand-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink" title={doc.file.name}>{doc.file.name}</p>
              <p className="text-xs text-brand-500">
                {(doc.file.size / 1024).toFixed(0)} KB
                {doc.extracted && ` · ${doc.extracted.source === 'pdf-text' ? 'Text read from PDF' : `OCR ${Math.round(doc.extracted.confidence)}% confidence`}`}
                {doc.extracted && doc.extracted.pages > 1 && ` · ${doc.extracted.pages} pages`}
              </p>
            </div>
            <button onClick={onRemove} className="rounded p-1 text-brand-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${doc.file.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {doc.status === 'reading' && (
            <div className="mt-3">
              <p className="flex items-center gap-2 text-sm text-brand-700">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading document… {Math.round(doc.progress * 100)}%
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-100">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(doc.progress * 100)}%` }} />
              </div>
            </div>
          )}

          {doc.status !== 'reading' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {verdict && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${verdict.className}`}>
                  <verdict.Icon className="h-3.5 w-3.5" /> {verdict.label}
                </span>
              )}
              {analysis && (
                <select
                  className="rounded-md border border-brand-200 bg-white px-2 py-1 text-xs font-medium text-brand-800"
                  value={doc.typeOverride ?? analysis.detectedTypeId}
                  onChange={(e) => {
                    const v = e.target.value as DocumentTypeId
                    onTypeChange(v === analysis.detectedTypeId ? null : v)
                  }}
                  aria-label={`Document type for ${doc.file.name}`}
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}{t.id === analysis.detectedTypeId ? ' (detected)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {doc.error && <p className="border-t border-brand-50 px-4 py-3 text-sm text-red-700">{doc.error}</p>}
      {doc.duplicateOf && (
        <p className="border-t border-brand-50 px-4 py-3 text-sm text-amber-700">
          This is the same file as {doc.duplicateOf}.
        </p>
      )}

      {analysis && analysis.verdict === 'unreadable' && (
        <p className="border-t border-brand-50 px-4 py-3 text-sm text-brand-700">
          No readable text was found. Ask for a clearer, well-lit photo or a scanned copy.
        </p>
      )}

      {analysis && analysis.checks.length > 0 && (
        <ul className="space-y-1.5 border-t border-brand-50 px-4 py-3 text-sm">
          {analysis.checks.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex gap-2">
              {checkIcon[c.status]}
              <span><span className="font-medium text-brand-800">{c.label}:</span> <span className="text-brand-700">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}

      {analysis && analysis.verdict !== 'unreadable' && (
        <ExtractedFields analysis={analysis} />
      )}

      {doc.extracted && (
        <div className="border-t border-brand-50">
          <button
            onClick={() => setShowText((s) => !s)}
            className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50"
            aria-expanded={showText}
          >
            Text read from the document
            <ChevronDown className={`h-4 w-4 transition ${showText ? 'rotate-180' : ''}`} />
          </button>
          {showText && (
            <pre className="max-h-48 overflow-auto bg-brand-50/60 px-4 py-3 text-xs whitespace-pre-wrap text-brand-800">
              {doc.extracted.text.trim() || '(no text)'}
            </pre>
          )}
        </div>
      )}

      {doc.hash && (
        <p className="truncate border-t border-brand-50 px-4 py-2 font-mono text-[10px] text-brand-400" title={doc.hash}>
          SHA-256 {doc.hash}
        </p>
      )}
    </article>
  )
}

function ExtractedFields({ analysis }: { analysis: DocumentAnalysis }) {
  const f = analysis.fields
  const type = documentType(analysis.typeId)
  const rows: [string, string | null][] = [
    ['Name found', f.name],
    ['Date of birth', type.checks.includes('dateOfBirth') ? f.dateOfBirth : null],
    ['Income', type.checks.includes('income') && f.income !== null ? formatPeso(f.income) : null],
    ['Amount', type.checks.includes('amount') && f.amount !== null ? formatPeso(f.amount) : null],
    ['Document date', type.checks.includes('recent') ? f.documentDate : null],
    ['ID number', type.checks.includes('idNumber') ? f.idNumber : null],
  ]
  const shown = rows.filter(([, v]) => v)
  if (shown.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-brand-50 px-4 py-3 text-xs">
      {shown.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-brand-500">{k}</dt>
          <dd className="truncate font-medium text-ink" title={v ?? ''}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
