// Talks to the UDEI Express API (/api/member/*). Set EXPO_PUBLIC_API_URL in mobile/.env,
// e.g. http://192.168.1.10:5000/api when the phone and the laptop share the same Wi-Fi.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
// The UDEI web app, for pages the phone opens in the browser (the printable co-maker's statement).
// Set EXPO_PUBLIC_WEB_URL in mobile/.env, e.g. http://192.168.1.10:5173.
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/$/, '')

/** The co-maker's statement of one co-maker on the web, filled from the application, to print and sign. */
export const coMakerFormUrl = (applicationId: string, memberId: string) =>
  `${WEB_URL}/co-maker/${applicationId}/${encodeURIComponent(memberId)}/form`

export type Session = {
  id: string
  fullName: string
  email: string
  role: string
  memberNo: string | null
  /** The member number the account is linked to, or its own provisional N-… ID until the office links it. */
  memberId?: string | null
}

export type Application = {
  id: string
  applicationNo: string
  status: 'pending' | 'approved' | 'denied'
  waitingFor: string | null
  signed: { step: string; decision: 'approved' | 'denied'; signedAt: string }[]
  denialNote: string | null
  /** Once denied: what counted against it and what helps, in plain words. */
  reasons: { against: { feature: string; text: string }[]; tips: string[] } | null
  loan: { loanType: string; amount: number; termMonths: number; monthlyRate: number; paymentFrequency: string; purpose?: string }
  loanId: string | null
  loanNo: string | null
  createdAt: string
  /** Supporting documents on the application (older servers leave this out). */
  documents?: AppDocument[]
  coMakers?: { memberId: string; name: string | null; status: 'pending' | 'accepted' | 'declined'; statementUploaded: boolean }[]
  /** A signer asked for a co-maker, and none has accepted yet: who asked, and why. */
  coMakerRequest?: { byName: string; role: string | null; note: string; at: string } | null
  nonMember?: boolean
}

export type AppDocument = { fileName: string; type: string | null; uploaded: boolean; addedAt: string | null }

/** A photo or PDF picked on the phone, waiting to be sent. */
export type PickedFile = { uri: string; name: string; mimeType: string; type: string }

export type Installment = { no: number; dueDate: string; totalDue: number; paid: number }

export type Loan = {
  id: string
  loanNo: string
  loanType: string
  status: 'for_release' | 'active' | 'paid'
  principal: number
  monthlyRate: number
  termMonths: number
  paymentFrequency: string
  releasedAt: string | null
  totalPayable: number
  amountPaid: number
  balance: number
  nextDue: { no: number; dueDate: string; amount: number } | null
  pastDue: boolean
  pastDueAmount: number
  maturesOn: string | null
  /** Installments paid before their due date by advance payments. */
  paidAhead?: { count: number; amount: number }
  /** When payroll, deducting the same amount every cutoff, pays off the rest. */
  finishesAround?: string | null
  schedule: Installment[]
}

export type LoanSettings = {
  products: Record<'long_term' | 'emergency', { label: string; monthlyRate: number; maxTermMonths: number }>
  minMonthlySalary: number
  /** No longer enforced: a member's co-maker is optional, and the signers ask for one case by case. */
  coMakersRequired?: number
  /** The office is reminded to consider a co-maker from this amount. Never a requirement. */
  coMakersFromAmount?: number
  /** Applicants not linked to a UDEI member number borrow at most this, with a member as co-maker. 0: no limit. */
  nonMemberMaxAmount?: number
}

export type Payment = { id: string; amount: number; paidAt: string; method: string; orNumber?: string | null }

/** A payment sent outside payroll, on its way: the Treasurer issues the OR, then the Bookkeeper posts it. */
export type PaymentSubmission = {
  _id: string
  amount: number
  method: 'cash' | 'e_money' | 'bank_transfer'
  methodLabel: string
  paidAt: string
  reference?: string
  proof: { fileName: string } | null
  status: 'submitted' | 'received' | 'posted' | 'rejected'
  received?: { orNumber?: string }
  rejected?: { reason?: string }
  voided?: { reason?: string }
  createdAt: string
}

export type ScoreBand = 'strong' | 'good' | 'fair' | 'weak' | 'limited'

/** The member's own member score (savings, attendance, bills, co-maker record, repayment), worded to them. Never an application's ML score. */
export type MemberScoreView = {
  score: number | null
  band: ScoreBand
  coverage: number
  parts: { key: string; label: string; weight: number; value: number | null; detail: string }[]
  tips: string[]
  strengths: string[]
}
export type MyScore = { linked: false; score: null } | { linked: true; memberId: string; score: MemberScoreView; asOf: string }

/** The co-maker portal (GET /comaker), the same as the web Co-maker page. */
export type CoMakerRequest = {
  applicationId: string
  applicationNo: string
  borrowerName: string
  amount: number
  termMonths: number
  loanType: string
  purpose: string | null
  filedAt: string
  status: 'pending' | 'approved' | 'denied'
  waitingFor: string | null
  myStatus: 'pending' | 'accepted' | 'declined'
  respondedAt: string | null
  otherCoMakers: { name: string; status: string }[]
  statementUploaded?: boolean
  statementUploadedAt?: string | null
  /** The borrower isn't a UDEI member: the final signature waits for your signed statement. */
  statementRequired?: boolean
}
export type VouchedLoan = {
  loanId: string
  loanNo: string
  borrowerName: string
  status: string
  balance: number
  amountPaid: number
  totalPayable: number
  nextDue: { amount: number; dueDate: string } | null
  pastDue: boolean
  pastDueAmount: number
  standing: 'on_track' | 'behind' | 'paid'
}
export type CoMakerPortal = { linked: boolean; requests: CoMakerRequest[]; loans: VouchedLoan[]; alerts: { loanId: string; text: string }[] }

let token: string | null = null
let onUnauthorized: (() => void) | null = null

export function setToken(t: string | null) {
  token = t
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown; file?: { data: Blob; type: string } } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.file ? { 'Content-Type': options.file.type } : options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.file ? options.file.data : options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, "Can't reach the UDEI server. Check your internet connection.")
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && token) onUnauthorized?.()
  if (!res.ok) throw new ApiError(res.status, json.error || 'Something went wrong. Please try again.', json.code)
  return json as T
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; session: Session }>('/member/login', { method: 'POST', body: { email, password } }),
  register: (body: { fullName: string; email: string; memberNo: string; phone?: string; password: string }) =>
    request<{ verificationRequired: true; email: string; emailSent: boolean }>('/member/register', { method: 'POST', body }),
  verifyEmail: (email: string, code: string) =>
    request<{ token: string; session: Session }>('/member/verify-email', { method: 'POST', body: { email, code } }),
  resendVerification: (email: string) => request<{ ok: true }>('/member/resend-verification', { method: 'POST', body: { email } }),
  me: () => request<{ session: Session }>('/member/me'),
  /** Ends this session on the server, so the token stops working even if it was copied. */
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  applications: () => request<{ applications: Application[] }>('/member/applications'),
  apply: (body: Record<string, unknown>) =>
    request<{ application: Application }>('/member/applications', { method: 'POST', body }),
  /** Sends one supporting document to a pending application of yours. */
  uploadDocument: async (applicationId: string, file: PickedFile) => {
    let data: Blob
    try {
      data = await (await fetch(file.uri)).blob()
    } catch {
      throw new ApiError(0, `Couldn't read ${file.name} on this phone.`)
    }
    const query = `?type=${encodeURIComponent(file.type)}&name=${encodeURIComponent(file.name)}`
    return request<{ application: Application }>(`/member/applications/${applicationId}/documents${query}`, {
      method: 'POST',
      file: { data, type: file.mimeType },
    })
  },
  loans: () => request<{ loans: Loan[] }>('/member/loans'),
  // UDEI's loan rules from the office's Settings page: rate per month, longest term, minimum salary.
  settings: () => request<{ settings: LoanSettings }>('/settings'),
  loan: (id: string) => request<{ loan: Loan; payments: Payment[]; submissions?: PaymentSubmission[] }>(`/member/loans/${id}`),
  /** Reports a payment made outside payroll (cash, e-money, bank transfer). Amount in centavos. */
  sendPayment: (loanId: string, body: { amount: number; method: string; paidAt: string; reference?: string; note?: string }) =>
    request<{ submission: PaymentSubmission }>(`/member/loans/${loanId}/payments`, { method: 'POST', body }),
  /** The photo or PDF of the receipt, for a payment that waits for the Treasurer. */
  uploadProof: async (submissionId: string, file: PickedFile) => {
    let data: Blob
    try {
      data = await (await fetch(file.uri)).blob()
    } catch {
      throw new ApiError(0, `Couldn't read ${file.name} on this phone.`)
    }
    return request<{ submission: PaymentSubmission }>(`/payments/${submissionId}/proof?name=${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      file: { data, type: file.mimeType },
    })
  },
  /** Your own member score with Kuwi's tips. Always your own: the server never takes a member ID. */
  myScore: () => request<MyScore>('/me/score'),
  /** Name co-makers on your application after filing (when a signer asked for one). */
  setCoMakers: (applicationId: string, coMakers: string[]) =>
    request<{ application: Application }>(`/member/applications/${applicationId}/co-makers`, { method: 'PUT', body: { coMakers } }),
  coMaker: () => request<CoMakerPortal>('/comaker'),
  respondCoMaker: (applicationId: string, decision: 'accepted' | 'declined', note?: string) =>
    request<{ request: CoMakerRequest }>(`/comaker/requests/${applicationId}`, { method: 'POST', body: { decision, ...(note ? { note } : {}) } }),
}
