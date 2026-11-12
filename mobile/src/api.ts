// Talks to the UDEI Express API (/api/member/*). Set EXPO_PUBLIC_API_URL in mobile/.env,
// e.g. http://192.168.1.10:5000/api when the phone and the laptop share the same Wi-Fi.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')

export type Session = { id: string; fullName: string; email: string; role: string; memberNo: string | null }

export type Application = {
  id: string
  applicationNo: string
  status: 'pending' | 'approved' | 'denied'
  waitingFor: string | null
  signed: { step: string; decision: 'approved' | 'denied'; signedAt: string }[]
  denialNote: string | null
  loan: { loanType: string; amount: number; termMonths: number; monthlyRate: number; paymentFrequency: string; purpose?: string }
  loanId: string | null
  loanNo: string | null
  createdAt: string
}

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
  schedule: Installment[]
}

export type Payment = { id: string; amount: number; paidAt: string; method: string }

let token: string | null = null
let onUnauthorized: (() => void) | null = null

export function setToken(t: string | null) {
  token = t
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, "Can't reach the UDEI server. Check your internet connection.")
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && token) onUnauthorized?.()
  if (!res.ok) throw new ApiError(res.status, json.error || 'Something went wrong. Please try again.')
  return json as T
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; session: Session }>('/member/login', { method: 'POST', body: { email, password } }),
  register: (body: { fullName: string; email: string; memberNo: string; phone?: string; password: string }) =>
    request<{ token: string; session: Session }>('/member/register', { method: 'POST', body }),
  me: () => request<{ session: Session }>('/member/me'),
  applications: () => request<{ applications: Application[] }>('/member/applications'),
  apply: (body: Record<string, unknown>) =>
    request<{ application: Application }>('/member/applications', { method: 'POST', body }),
  loans: () => request<{ loans: Loan[] }>('/member/loans'),
  loan: (id: string) => request<{ loan: Loan; payments: Payment[] }>(`/member/loans/${id}`),
}
