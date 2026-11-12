// Loans as GET /api/loans returns them. Every amount is an integer number of centavos (₱1 = 100).
import type { LoanType } from './applications'
import { reasonLabel } from './deductions'
import type { MissReason } from './deductions'

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
  /** "ledger": a balance carried over from UDEI's spreadsheet, given a payroll deduction. No application. */
  source?: 'application' | 'ledger'
  application?: string
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
  release?: {
    releasedAt?: string
    voucherNo?: string
    releasedByName?: string
    netProceeds?: number
    /** Old loans paid off from this loan's proceeds. */
    offsets?: { loan: string; loanNo: string; amount: number }[]
  }
  schedule: Installment[]
  createdAt: string
  /** Set when payroll reported the borrower separated from DNSC. */
  collectFrom?: { source: 'final_pay'; cutoffDate?: string }
  /** This loan's line on the latest posted payroll deduction run. */
  lastDeduction?: { cutoffDate: string; result: 'full' | 'partial' | 'missed'; reason?: MissReason; reasonNote?: string }
  // Computed by the server
  totalPayable: number
  amountPaid: number
  balance: number
  nextDue: { no: number; dueDate: string; amount: number } | null
  pastDue: boolean
  pastDueAmount: number
}

export type PaymentMethod = 'payroll' | 'cash' | 'other' | 'offset'

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

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  payroll: 'Payroll deduction',
  cash: 'Cash',
  other: 'Other',
  offset: 'Deducted from a new loan',
}

/** Methods the Bookkeeper and Treasurer can record by hand. Offsets only come from a release. */
export const MANUAL_METHODS: PaymentMethod[] = ['payroll', 'cash', 'other']

/** Another active loan of the same borrower, offered on the release form. */
export type OtherActiveLoan = { _id: string; loanNo: string; loanType: LoanType; balance: number; suggested: boolean }

type BalanceGroup = {
  balance: number
  dueDate: string | null
  perMonth: number
  loans: { loanId: string; loanNo: string; balance: number; maturity: string | null; paymentFrequency: 'quincenal' | 'monthly'; installment: number; perMonth: number }[]
}

/** GET /api/loans/balances: a member's Mutual Assistance balances from the ledger, in centavos. */
export type MemberBalances = {
  memberId: string
  /** Any loan on record, even paid ones. When false, the Bookkeeper types the balances. */
  hasLoans: boolean
  asOf?: string
  /** long_term loans */
  longTerm: BalanceGroup
  /** emergency loans */
  shortTerm: BalanceGroup
  monthlyPayment: number
}

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

/** "Missed deduction on Oct 15, 2026: Leave without pay" when the latest posted payroll run missed this loan. */
export function missedDeductionText(l: Pick<Loan, 'lastDeduction'>): string | null {
  const d = l.lastDeduction
  if (!d || d.result === 'full') return null
  const why = d.reason ? reasonLabel[d.reason] + (d.reasonNote ? ` (${d.reasonNote})` : '') : 'no reason given'
  return `${d.result === 'partial' ? 'Partial deduction' : 'Missed deduction'} on ${formatDay(d.cutoffDate)}: ${why}`
}

/** Same calendar day as the server's "today" (Asia/Manila), for marking installments past due. */
export const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
