import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldCheck, XCircle } from 'lucide-react'
import { FormSection } from './Field'
import UploadSlot from './UploadSlot'
import type { useSupportingDocuments } from './useSupportingDocuments'
import { loanTypeLabel } from '../../lib/applications'
import type { LoanType } from '../../lib/applications'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentVerdict } from '../../lib/ocr/analyzeDocument'

type Props = { loanType: LoanType; documents: ReturnType<typeof useSupportingDocuments> }

const verdictText: Record<DocumentVerdict, string> = {
  verified: 'Matches the form',
  review: 'Uploaded, check by eye',
  mismatch: 'Doesn’t match the form',
  unreadable: 'Uploaded, but no text could be read',
}

function VerdictIcon({ verdict, reading }: { verdict: DocumentVerdict | null; reading: boolean }) {
  const cls = 'mt-0.5 h-4 w-4 shrink-0'
  if (reading && !verdict) return <Loader2 className={`${cls} animate-spin text-brand-500`} />
  if (verdict === 'verified') return <CheckCircle2 className={`${cls} text-emerald-600`} />
  if (verdict === 'mismatch') return <XCircle className={`${cls} text-red-600`} />
  if (verdict === 'review' || verdict === 'unreadable') return <AlertTriangle className={`${cls} text-amber-600`} />
  return <Circle className={`${cls} text-brand-300`} />
}

export default function DocumentsSection({ loanType, documents: d }: Props) {
  const slotProps = { analyses: d.analyses, duplicates: d.duplicates, onTypeChange: d.setType, onRemove: d.removeDoc }

  return (
    <FormSection
      title="Supporting documents"
      subtitle="Take a photo of each document or choose a file (JPEG, PNG, WebP or PDF, up to 10 MB). Each one is read on this device and checked against the form above."
    >
      <div className="mb-4 rounded-lg bg-brand-50 p-3">
        <p className="mb-2 text-sm font-semibold text-brand-800">Required for {loanTypeLabel[loanType]}</p>
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {d.checklist.map(({ typeId, verdict, reading }) => (
            <li key={typeId} className="flex min-w-0 items-start gap-2">
              <VerdictIcon verdict={verdict} reading={reading} />
              <span className="min-w-0">
                <span className="font-medium text-ink">{documentType(typeId).label}</span>
                <span className="block text-xs text-brand-600">
                  {verdict ? verdictText[verdict] : reading ? 'Reading…' : 'Not uploaded yet'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {d.required.map((typeId) => (
          <UploadSlot
            key={typeId}
            {...slotProps}
            typeId={typeId}
            docs={d.docs.filter((x) => x.slot === typeId)}
            onFiles={(files) => d.addFiles(typeId, files)}
          />
        ))}
        <UploadSlot
          {...slotProps}
          typeId="other"
          title="Add another document"
          multiple
          docs={d.docs.filter((x) => x.slot === 'other')}
          onFiles={(files) => d.addFiles('other', files)}
        />
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-brand-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent" /> Each file is sealed with a SHA-256 fingerprint.
      </p>
    </FormSection>
  )
}
