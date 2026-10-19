import { useRef } from 'react'
import { AlertTriangle, Camera, FolderOpen } from 'lucide-react'
import DocumentCard from './DocumentCard'
import type { SlotDocument } from './useSupportingDocuments'
import type { DocumentAnalysis } from '../../lib/ocr/analyzeDocument'
import { documentType } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../../lib/ocr/documentTypes'

type Props = {
  typeId: DocumentTypeId
  title?: string
  docs: SlotDocument[]
  analyses: Map<string, DocumentAnalysis>
  duplicates: Map<string, string>
  multiple?: boolean
  onFiles: (files: FileList) => void
  onTypeChange: (key: string, type: DocumentTypeId | null) => void
  onRemove: (key: string) => void
}

export default function UploadSlot({ typeId, title, docs, analyses, duplicates, multiple = false, onFiles, onTypeChange, onRemove }: Props) {
  const camera = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const type = documentType(typeId)
  const filled = docs.length > 0

  const onChange = (e: { target: HTMLInputElement }) => {
    if (e.target.files?.length) onFiles(e.target.files)
    e.target.value = '' // so choosing the same file again still fires
  }

  return (
    <div className="min-w-0 rounded-lg border border-brand-100 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold text-ink">{title ?? type.label}</p>
          <p className="text-xs text-brand-500">{type.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary px-3" onClick={() => camera.current?.click()}>
            <Camera className="h-4 w-4" /> Take photo
          </button>
          <button type="button" className="btn-ghost px-3" onClick={() => picker.current?.click()}>
            <FolderOpen className="h-4 w-4" /> Choose file
          </button>
        </div>
        {/* Two inputs: capture opens the rear camera on phones; the plain one keeps the gallery and PDFs. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden" onChange={onChange} />
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple={multiple} className="hidden" onChange={onChange} />
      </div>

      {filled && !multiple && <p className="mt-2 text-xs text-brand-500">A new photo or file replaces this one.</p>}

      {filled && (
        <div className="mt-3 space-y-3">
          {docs.map((d) => {
            const a = analyses.get(d.key)
            const looksLike = a && a.detectedTypeId !== a.typeId && a.detectedTypeId !== 'other' ? documentType(a.detectedTypeId).label : null
            return (
              <div key={d.key} className="min-w-0 space-y-2">
                {looksLike && (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      This looks like a {looksLike}. Check it's the right file, or change its type below.
                    </span>
                  </p>
                )}
                <DocumentCard
                  doc={{ ...d, duplicateOf: duplicates.get(d.key) ?? null }}
                  analysis={a ?? null}
                  onTypeChange={(t) => onTypeChange(d.key, t)}
                  onRemove={() => onRemove(d.key)}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
