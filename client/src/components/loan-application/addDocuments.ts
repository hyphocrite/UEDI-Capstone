import { api } from '../../lib/api'
import type { LoanApplication } from '../../lib/applications'
import type { DocumentPayload } from './applicationForm'

type Files = { file: File; hash: string | null }[]

/** Uploads each checked file into its place on the application. Returns the names that failed. */
export async function uploadFiles(applicationId: string, files: Files, indexes: number[]) {
  const failed: string[] = []
  for (let i = 0; i < files.length; i++) {
    const { file, hash } = files[i]
    if (!hash) continue // unreadable files were never fingerprinted
    try {
      await api(`/api/applications/${applicationId}/documents/${indexes[i]}`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
    } catch {
      failed.push(file.name)
    }
  }
  return failed
}

/**
 * Adds supporting documents to a filed application (allowed until it is decided): first their
 * checks, then the files. `payload` and `files` come from useSupportingDocuments, in the same order.
 */
export async function addDocuments(applicationId: string, payload: DocumentPayload[], files: Files) {
  const { application, indexes } = await api<{ application: LoanApplication; indexes: number[] }>(`/api/applications/${applicationId}/documents`, {
    method: 'POST',
    body: JSON.stringify({ documents: payload }),
  })
  return { application, failed: await uploadFiles(applicationId, files, indexes) }
}
