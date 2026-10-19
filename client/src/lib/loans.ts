// Loans as GET /api/loans returns them. Every amount is an integer number of centavos (₱1 = 100).
import type { LoanType } from './applications'

export type LoanStatus = 'for_release' | 'active' | 'paid'

export type Installment = {
  no: number
  dueDate: string
  principalDue: number
  interestDue: number
  totalDue: number
  paid: number
  interestPaid: number
  principalPaid: number
}

export type Loan = {
  _id: string
  loanNo: string
  application: string
  applicationNo?: string
  borrowerName: string
  memberId?: string
  loanType: LoanType
  principal: number
  monthlyRate: number
  termMonths: number
  paymentFrequency: 'quincenal' | 'monthly'
  existingBalances: number
  status: LoanStatus
  release?: { releasedAt?: string; voucherNo?: string; releasedByName?: string; netProceeds?: number }
  schedule: Installment[]
  createdAt: string
  // Computed by the server
  totalPayable: number
  amountPaid: number
  balance: number
  nextDue: { no: number; dueDate: string; amount: number } | null
  pastDue: boolean
  pastDueAmount: number
}

export type PaymentMethod = 'payroll' | 'cash' | 'other'

export type Payment = {
  _id: string
  amount: number
  paidAt: string
  method: PaymentMethod
  reference?: string
  recordedByName?: string
  voided: boolean
  voidReason?: string
  voidedByName?: string
  voidedAt?: string
  createdAt: string
}

export const paymentMethodLabel: Record<PaymentMethod, string> = { payroll: 'Payroll deduction', cash: 'Cash', other: 'Other' }

/** What the Loans page and StatusBadge show. Past due is computed; it is an active loan with an overdue installment. */
export type LoanDisplayStatus = 'For release' | 'Active' | 'Past due' | 'Fully paid'

export function displayStatus(l: Pick<Loan, 'status' | 'pastDue'>): LoanDisplayStatus {
  if (l.status === 'for_release') return 'For release'
  if (l.status === 'paid') return 'Fully paid'
  return l.pastDue ? 'Past due' : 'Active'
}

const peso2 = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ₱1,234.56 from centavos. */
export const formatCentavos = (centavos: number) => peso2.format(centavos / 100)

/** Pesos typed by the user to whole centavos. */
export const toCentavos = (pesos: string | number) => Math.round(Number(pesos) * 100)

/** Calendar dates are stored as UTC midnight, so format them in UTC to keep the same day everywhere. */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Today as YYYY-MM-DD in the viewer's time zone, for date inputs. */
export const todayInput = () => new Date().toLocaleDateString('en-CA')

/** Same calendar day as the server's "today" (Asia/Manila), for marking installments past due. */
export const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
