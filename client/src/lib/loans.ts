// Loans as GET /api/loans returns them. Every amount is an integer number of centavos (₱1 = 100).
import type { LoanType } from './applications'
import { MODE_HINT, MODE_LABEL, shortLabel } from './paymentModes'
import type { BonusType, PaymentMode, PaymentModeChange } from './paymentModes'
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
  /** Installments paid before their due date by advance payments, and the amount on them. */
  paidAhead?: { count: number; amount: number }
  /** When payroll, deducting the same amount every cutoff, pays off the rest. Null when paid or past the schedule. */
  finishesAround?: string | null
  /** The mode filed, then the latest change asked for. paymentModeNow/Label: the mode this month. */
  paymentMode?: PaymentMode
  bonusType?: BonusType
  paymentModeHistory?: PaymentModeChange[]
  paymentModeNow?: PaymentMode
  paymentModeLabel?: string
  /** Short term that became long term when unpaid at the end of its term; the old schedule is kept. */
  conversions?: { at: string; fromType: LoanType; toType: LoanType; balance: number; oldSchedule: Installment[]; newTermMonths: number; monthlyRate: number }[]
}

export type PaymentMethod = 'payroll' | 'cash' | 'e_money' | 'bank_transfer' | 'other' | 'offset'

export type Payment = {
  _id: string
  amount: number
  paidAt: string
  method: PaymentMethod
  reference?: string
  /** The service fee taken from it (1% of payroll postings by default), and the gross received. */
  serviceFee?: number
  grossAmount?: number
  /** The Treasurer's Official Receipt (cash, e-money, bank transfer). */
  orNumber?: string
  /** The submission on the Payments page this payment came from. */
  paymentSubmission?: string
  /** Payroll payments: the cutoff of the deduction run that posted it. */
  runCutoff?: string | null
  recordedByName?: string
  voided: boolean
  voidReason?: string
  voidedByName?: string
  voidedAt?: string
  createdAt: string
}

/** How one payment came in ("Mode of payment"), in the same words as the loan's mode (paymentModes.ts). */
export const paymentMethodLabel: Record<PaymentMethod, string> = {
  payroll: MODE_LABEL.payroll,
  cash: MODE_LABEL.cash,
  e_money: MODE_LABEL.e_money,
  bank_transfer: MODE_LABEL.bank_transfer,
  other: 'Adjustment',
  offset: 'Offset from new release',
}

/** For narrow table cells ("Cash", "E-wallet"); put paymentMethodLabel in title="". */
export const paymentMethodShort = Object.fromEntries(Object.entries(paymentMethodLabel).map(([k, v]) => [k, shortLabel(v)])) as Record<PaymentMethod, string>

/** The hint for the two methods the office records by hand. */
export const paymentMethodHint: Partial<Record<PaymentMethod, string>> = {
  payroll: MODE_HINT.payroll,
  other: 'Correction entered by the Bookkeeper.',
  offset: 'Old balance deducted from a new mutual assistance.',
}

/**
 * Methods the Bookkeeper and Treasurer can record straight onto a loan: payroll and corrections.
 * Cash, e-money and bank transfers go through the Payments page (OR, then confirm). Offsets only
 * come from a release.
 */
export const MANUAL_METHODS: PaymentMethod[] = ['payroll', 'other']

/** "OR 1234" for receipted payments, "Payroll run Oct 15, 2026" for payroll; the ledger's OR / run column. */
export function receiptOf(p: Pick<Payment, 'method' | 'orNumber' | 'runCutoff' | 'reference'>): string {
  if (p.orNumber) return `OR ${p.orNumber}`
  if (p.method === 'payroll') return p.runCutoff ? `Payroll run ${formatDay(p.runCutoff)}` : p.reference || 'Payroll run'
  return '—'
}

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
