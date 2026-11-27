// Payments outside payroll on their way to the ledger (GET /api/payments). Amounts in centavos.
// A member or the office submits; the Treasurer receives it and issues the Official Receipt (OR);
// the Bookkeeper confirms, which posts it to the loan. Either may reject it with a reason.
import { ApiError } from './api'
import { MODE_HINT, MODE_LABEL } from './paymentModes'

export type SubmissionMethod = 'cash' | 'e_money' | 'bank_transfer'
export type SubmissionStatus = 'submitted' | 'received' | 'posted' | 'rejected'

type Who = { byName?: string; at?: string }

export type PaymentSubmission = {
  _id: string
  loan: string
  loanNo: string
  memberId?: string
  borrowerName: string
  amount: number
  method: SubmissionMethod
  methodLabel: string
  paidAt: string
  reference?: string
  proof: { fileName: string; contentType: string; uploadedAt: string } | null
  note?: string
  submittedByName?: string
  source: 'member' | 'office'
  status: SubmissionStatus
  received?: Who & { orNumber?: string; receivedAt?: string }
  confirmed?: Who
  payment?: string
  rejected?: Who & { reason?: string }
  voided?: Who & { reason?: string }
  createdAt: string
}

/** Modes of payment a payment outside payroll can come in by (labels from paymentModes.ts). */
export const SUBMISSION_METHODS: { value: SubmissionMethod; label: string; hint: string }[] = (['e_money', 'bank_transfer', 'cash'] as const).map((value) => ({
  value,
  label: MODE_LABEL[value],
  hint: MODE_HINT[value],
}))

export const submissionStatusLabel: Record<SubmissionStatus, string> = {
  submitted: 'Waiting for the Treasurer',
  received: 'OR issued, waiting for the Bookkeeper',
  posted: 'Posted',
  rejected: 'Rejected',
}

/** Classes for the status chip. */
export const submissionStatusTone: Record<SubmissionStatus, string> = {
  submitted: 'bg-amber-50 text-amber-800 ring-amber-200',
  received: 'bg-sky-50 text-sky-800 ring-sky-200',
  posted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
}

/** What the member reads before sending a payment (section 4 of the bookkeeper interview). */
export const ADVANCE_NOTE = 'Your payroll deduction keeps running. This is an advance payment.'

const BASE = import.meta.env.VITE_API_URL ?? ''
export const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

/** Uploads the proof photo or PDF of a submission (PUT /api/payments/:id/proof). */
export async function uploadProof(id: string, file: File): Promise<PaymentSubmission> {
  if (!PROOF_ACCEPT.split(',').includes(file.type)) throw new ApiError('Upload a photo (JPEG, PNG, WebP) or a PDF.', 415)
  if (file.size > 10 * 1024 * 1024) throw new ApiError('Files can be at most 10 MB.', 413)
  const res = await fetch(`${BASE}/api/payments/${id}/proof?name=${encodeURIComponent(file.name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Could not upload the proof.', res.status)
  return data.submission
}
