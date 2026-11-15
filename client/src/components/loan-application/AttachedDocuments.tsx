import { AlertTriangle, CheckCircle2, Paperclip, XCircle } from 'lucide-react'
import { FormSection } from './Field'
import type { LoanApplication } from '../../lib/applications'
import { formatDate } from '../../lib/format'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'

/** The documents already on a filed application, read-only. New ones are added below it. */
export default function AttachedDocuments({ documents }: { documents: LoanApplication['documents'] }) {
  return (
    <FormSection title="Already attached" subtitle="These stay on the application. Add more below.">
      {documents.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-brand-500"><Paperclip className="h-4 w-4" /> No documents yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {documents.map((d, i) => (
            <li key={`${d.fileName}-${i}`} className="flex min-w-0 items-start gap-2">
              {d.verdict === 'verified' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : d.verdict === 'mismatch' || d.verdict === 'unreadable' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
              <span className="min-w-0 break-words">
                <span className="font-medium text-ink">{d.type ? documentType(d.type as DocumentTypeId)?.label ?? d.type : 'Document'}</span>
                <span className="text-brand-500"> · {d.fileName}</span>
                {d.addedAt && <span className="text-xs text-brand-500"> · added {formatDate(d.addedAt)}</span>}
                {!d.fileId && <span className="block text-xs text-amber-700">The file itself wasn't stored; bring the original to the UDEI office.</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  )
}
