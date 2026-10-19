import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UploadedDocument } from './DocumentCard'
import type { DocumentPayload } from './applicationForm'
import { analyzeDocument } from '../../lib/ocr/analyzeDocument'
import type { Applicant, DocumentAnalysis, DocumentVerdict } from '../../lib/ocr/analyzeDocument'
import { REQUIRED_DOCUMENTS } from '../../lib/ocr/documentTypes'
import type { DocumentTypeId, LoanType } from '../../lib/ocr/documentTypes'
import { sha256HexFromFile } from '../../lib/ocr/fileHash'
import { extractText, isSupportedFile } from '../../lib/ocr/textExtract'

/** A file and the upload slot it sits in. 'other' is the "Add another document" area. */
export type SlotDocument = UploadedDocument & { slot: DocumentTypeId }

export type ChecklistItem = { typeId: DocumentTypeId; verdict: DocumentVerdict | null; reading: boolean; filled: boolean }

let keySeq = 0

const rank = (v: DocumentVerdict) => ({ verified: 0, review: 1, mismatch: 2, unreadable: 3 })[v]

/** The type a file is checked as: what the type dropdown shows. */
export const effectiveType = (d: SlotDocument, a: DocumentAnalysis | undefined): DocumentTypeId =>
  d.typeOverride ?? a?.detectedTypeId ?? d.slot

export function useSupportingDocuments(applicant: Applicant, loanType: LoanType) {
  const [docs, setDocs] = useState<SlotDocument[]>([])
  const docsRef = useRef(docs)
  useEffect(() => {
    docsRef.current = docs
  }, [docs])

  // Free image previews when leaving the page.
  useEffect(() => () => docsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)), [])

  const patchDoc = useCallback(
    (key: string, patch: Partial<SlotDocument>) => setDocs((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d))),
    [],
  )

  // OCR runs once per file. The stored text is checked again whenever the applicant's details change.
  const analyses = useMemo(() => {
    const map = new Map<string, DocumentAnalysis>()
    for (const d of docs) {
      if (d.status !== 'done' || !d.extracted) continue
      map.set(
        d.key,
        analyzeDocument(d.extracted.text, applicant, {
          typeId: d.typeOverride ?? undefined,
          confidence: d.extracted.source === 'ocr' ? d.extracted.confidence : undefined,
        }),
      )
    }
    return map
  }, [docs, applicant])

  // The first copy of a file is fine; later copies point back at it.
  const duplicates = useMemo(() => {
    const first = new Map<string, string>()
    const dup = new Map<string, string>()
    for (const d of docs) {
      if (!d.hash) continue
      const seen = first.get(d.hash)
      if (seen) dup.set(d.key, seen)
      else first.set(d.hash, d.file.name)
    }
    return dup
  }, [docs])

  const addFiles = (slot: DocumentTypeId, files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    // Required slots hold one file; a new upload replaces the old one.
    const incoming = slot === 'other' ? list : list.slice(0, 1)
    const added: SlotDocument[] = incoming.map((file) => {
      const problem = isSupportedFile(file)
      return {
        key: `doc-${++keySeq}`,
        slot,
        file,
        previewUrl: file.type.startsWith('image/') && !problem ? URL.createObjectURL(file) : null,
        hash: null,
        status: problem ? 'error' : 'reading',
        progress: 0,
        extracted: null,
        typeOverride: slot,
        error: problem,
        duplicateOf: null,
      }
    })

    if (slot !== 'other') {
      docsRef.current.filter((d) => d.slot === slot).forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl))
    }
    setDocs((current) => [...current.filter((d) => slot === 'other' || d.slot !== slot), ...added])

    for (const doc of added) {
      if (doc.status === 'error') continue
      sha256HexFromFile(doc.file)
        .then((hash) => patchDoc(doc.key, { hash }))
        .catch(() => {})
      extractText(doc.file, (p) => patchDoc(doc.key, { progress: p }))
        .then((extracted) => patchDoc(doc.key, { extracted, status: 'done', progress: 1 }))
        .catch((err: unknown) =>
          patchDoc(doc.key, {
            status: 'error',
            error: `Could not read this file${err instanceof Error ? `: ${err.message}` : '.'}`,
          }),
        )
    }
  }

  const removeDoc = (key: string) => {
    const d = docsRef.current.find((x) => x.key === key)
    if (d?.previewUrl) URL.revokeObjectURL(d.previewUrl)
    setDocs((list) => list.filter((x) => x.key !== key))
  }

  const setType = (key: string, typeOverride: DocumentTypeId | null) => patchDoc(key, { typeOverride })

  /** Keeps files whose slot the new loan type doesn't have, by moving them to "Add another document". */
  const changeLoanType = (next: LoanType) => {
    const keep = new Set<DocumentTypeId>(REQUIRED_DOCUMENTS[next])
    setDocs((list) => list.map((d) => (d.slot === 'other' || keep.has(d.slot) ? d : { ...d, slot: 'other' })))
  }

  const required = REQUIRED_DOCUMENTS[loanType]

  // The checklist follows the type each file is checked as, not the slot it was uploaded to.
  const checklist: ChecklistItem[] = required.map((typeId) => {
    const matches = docs.filter((d) => d.status !== 'error' && effectiveType(d, analyses.get(d.key)) === typeId)
    const verdicts = matches.flatMap((d) => analyses.get(d.key)?.verdict ?? [])
    return {
      typeId,
      verdict: verdicts.sort((a, b) => rank(a) - rank(b))[0] ?? null,
      reading: matches.some((d) => d.status === 'reading'),
      filled: matches.some((d) => d.status === 'done'),
    }
  })

  const reading = docs.some((d) => d.status === 'reading')
  const mismatched = docs.filter((d) => analyses.get(d.key)?.verdict === 'mismatch')

  const payload = (): DocumentPayload[] =>
    docs.map((d) => {
      const a = analyses.get(d.key)
      return {
        fileName: d.file.name.slice(0, 255),
        type: effectiveType(d, a),
        verdict: d.status === 'error' ? 'unreadable' : a?.verdict,
        sha256: d.hash ?? undefined,
        notes: a?.checks
          .filter((c) => c.status === 'fail' || c.status === 'warn')
          .map((c) => `${c.label}: ${c.detail}`.slice(0, 300))
          .slice(0, 20),
      }
    })

  const clear = () => {
    docsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl))
    setDocs([])
  }

  return { docs, analyses, duplicates, required, checklist, reading, mismatched, addFiles, removeDoc, setType, changeLoanType, payload, clear }
}
