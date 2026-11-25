// State, validation and request body for the Mutual Assistance Application Form.
import { monthlyInstallment } from '../../lib/applications'
import type { EmploymentStatus, LoanApplication, LoanType } from '../../lib/applications'
import type { MemberBalances } from '../../lib/loans'
import type { Member, MemberHistory } from '../../lib/members'
import { coMakersRequiredFor, FALLBACK_SETTINGS, MIN_NET_TAKE_HOME_PAY, nonMemberLimit } from '../../lib/settings'
import type { LoanSettings } from '../../lib/settings'
import type { Applicant, DocumentAnalysis } from '../../lib/ocr/analyzeDocument'
import { BONUS_TYPES, FALLBACK_BONUS_CALENDAR, monthsBetween, nextBonusDate } from '../../lib/paymentModes'
import type { BonusType, PaymentMode } from '../../lib/paymentModes'

export type PeriodUnit = 'years' | 'months'

/** Where the Bookkeeper section's figures come from, after looking up the member ID. */
export type LedgerState =
  | { status: 'none' } // no member ID, or no loans on record: typed by hand
  | { status: 'loading'; memberId: string }
  | { status: 'ledger'; balances: MemberBalances }
  | { status: 'error'; message: string }
export type PaymentFrequency = 'quincenal' | 'monthly'

/** Inputs are kept as strings so fields can be empty while typing. */
export type Form = {
  memberId: string
  lastName: string
  firstName: string
  middleInitial: string
  residenceAddress: string
  employer: string
  employmentStatus: EmploymentStatus
  monthlySalary: string
  netTakeHomePay: string
  dateOfBirth: string
  yearsAsMember: string
  priorLoans: string
  priorLatePayments: string

  applicationDate: string
  loanType: LoanType
  amount: string
  purpose: string
  period: string
  periodUnit: PeriodUnit
  /** Always the Loan Settings rate for the loan type: shown, not typed. The server sets it too. */
  monthlyRate: string
  paymentFrequency: PaymentFrequency
  /** How the member will pay. Bonus: one payment on the chosen bonus's release date. */
  paymentMode: PaymentMode
  bonusType: BonusType | ''

  longTermBalance: string
  longTermDueDate: string
  shortTermBalance: string
  shortTermDueDate: string
  /** What the member already pays UEDI per month on open loans (pesos). */
  monthlyPayment: string

  payrollDeduction: boolean
  autoRestructure: boolean

  /** Member numbers of the co-makers ('' when not named). */
  coMaker1: string
  coMaker2: string
}

export const MAX_TERM_MONTHS = 120

/** The loan amounts UDEI offers, in pesos. Keep in step with mobile/src/screens/ApplyScreen.tsx. */
export const LOAN_AMOUNTS = [25000, 50000, 75000, 100000]

/** Amounts for an applicant who isn't a linked member: up to their limit. Keep in step with mobile/src/screens/ApplyScreen.tsx. */
export const NON_MEMBER_LOAN_AMOUNTS = [1000, 2000, 3000, 4000, 5000]

/** The amounts this applicant can choose from. */
export function loanAmountsFor(settings: LoanSettings, linked: boolean): number[] {
  const limit = nonMemberLimit(settings, linked)
  if (limit === null) return LOAN_AMOUNTS
  const under = NON_MEMBER_LOAN_AMOUNTS.filter((a) => a <= limit)
  return under.includes(limit) ? under : [...under, limit]
}

/** The rate on the Settings page for a loan type, as the form's string. */
export const rateFor = (settings: LoanSettings, t: LoanType) => String(settings.products[t].monthlyRate)

export const PAYROLL_DEDUCTION_TEXT =
  'I hereby authorize the Payroll Officer of my Employer, DNSC and/or the Treasurer of United DNSC Employees, Inc. to deduct the quincenal/monthly installment of my Mutual Assistance from my salary or from any form of benefits due to me.'
export const AUTO_RESTRUCTURE_TEXT = 'Further, I agree to the automatic re-structuring of my Mutual Assistance upon its maturity.'

const todayIso = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

export const emptyForm = (): Form => ({
  memberId: '',
  lastName: '',
  firstName: '',
  middleInitial: '',
  residenceAddress: '',
  employer: 'Davao del Norte State College',
  employmentStatus: 'permanent',
  monthlySalary: '',
  netTakeHomePay: '',
  dateOfBirth: '',
  yearsAsMember: '0',
  priorLoans: '0',
  priorLatePayments: '0',

  applicationDate: todayIso(),
  loanType: 'long_term',
  amount: '',
  purpose: '',
  period: '1',
  periodUnit: 'years',
  monthlyRate: rateFor(FALLBACK_SETTINGS, 'long_term'),
  paymentFrequency: 'quincenal',
  paymentMode: 'payroll',
  bonusType: '',

  longTermBalance: '0',
  longTermDueDate: '',
  shortTermBalance: '0',
  shortTermDueDate: '',
  monthlyPayment: '0',

  payrollDeduction: false,
  autoRestructure: false,
  coMaker1: '',
  coMaker2: '',
})

const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Loan period in whole months, or 0 when the period isn't a usable number. */
export function termMonthsOf(f: Pick<Form, 'period' | 'periodUnit'>) {
  const n = num(f.period)
  if (n <= 0) return 0
  return Math.round(f.periodUnit === 'years' ? n * 12 : n)
}

/**
 * A bonus-charged application: the bonus date (the next release at least 10 days after the
 * application date), the months to it, and the single payment with interest on the whole amount.
 */
export function bonusOf(f: Form, settings: LoanSettings = FALLBACK_SETTINGS) {
  if (f.paymentMode !== 'bonus' || !f.bonusType || !f.applicationDate) return null
  const dueDate = nextBonusDate(settings.bonusCalendar ?? FALLBACK_BONUS_CALENDAR, f.bonusType, f.applicationDate)
  const months = monthsBetween(f.applicationDate, dueDate)
  const amount = num(f.amount)
  const total = amount > 0 ? Math.round(amount * (1 + (num(f.monthlyRate) / 100) * months) * 100) / 100 : 0
  const label = BONUS_TYPES.find((b) => b.value === f.bonusType)?.label ?? 'bonus'
  return { dueDate, months, total, label }
}

export function installmentOf(f: Form) {
  const termMonths = termMonthsOf(f)
  const amount = num(f.amount)
  if (amount <= 0 || termMonths < 1) return null
  const monthly = monthlyInstallment({ amount, termMonths, monthlyRate: num(f.monthlyRate) })
  return { monthly, quincenal: monthly / 2 }
}

/** Amber note when the installment looks heavy for the applicant's pay. It never blocks submission. */
export function affordabilityNote(f: Form): string | null {
  const inst = installmentOf(f)
  const net = num(f.netTakeHomePay)
  if (!inst || net <= 0) return null
  // Existing UEDI deductions count too: net pay minus what is already deducted minus the new installment.
  const existing = num(f.monthlyPayment)
  const total = existing + inst.monthly
  const left = net - total
  const what = existing > 0 ? 'The new installment plus existing UDEI deductions' : 'The monthly installment'
  if (total > net / 2) return `${what} ${existing > 0 ? 'are' : 'is'} more than half of the net take-home pay.`
  if (left < 5000) return `Less than ₱5,000 of the net take-home pay is left after ${existing > 0 ? 'existing deductions and ' : ''}the new installment.`
  return null
}

/** The Bookkeeper section's fields from the ledger (centavos to pesos). */
export function booksFromLedger(b: MemberBalances): Partial<Form> {
  const pesos = (c: number) => String(c / 100)
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
  return {
    longTermBalance: pesos(b.longTerm.balance),
    longTermDueDate: day(b.longTerm.dueDate),
    shortTermBalance: pesos(b.shortTerm.balance),
    shortTermDueDate: day(b.shortTerm.dueDate),
    monthlyPayment: pesos(b.monthlyPayment),
  }
}

// Words that belong to the surname in Filipino and Spanish names: "Dela Cruz", "De los Santos".
const SURNAME_PARTICLES = new Set(['de', 'del', 'dela', 'la', 'las', 'los', 'delos', 'san', 'sta', 'sta.', 'santa', 'sto', 'sto.', 'santo', 'van', 'von', 'di', 'da', 'du', 'le'])

/** Splits a single-string name such as "Ana Dela Cruz" or "Maria C. Santos" into the form's three fields. */
export function splitName(full: string): { lastName: string; firstName: string; middleInitial: string } {
  const words = full.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return { lastName: words[0] ?? '', firstName: '', middleInitial: '' }

  let start = words.length - 1
  while (start > 1 && SURNAME_PARTICLES.has(words[start - 1].toLowerCase())) start--
  const lastName = words.slice(start).join(' ')
  const rest = words.slice(0, start)

  let middleInitial = ''
  if (rest.length > 1 && /^[A-Za-z]\.?$/.test(rest[rest.length - 1])) {
    middleInitial = rest.pop()!.replace('.', '').toUpperCase()
  }
  return { lastName, firstName: rest.join(' '), middleInitial }
}

/**
 * Prefills what UDEI already knows about a member (GET /api/members/:id): name when on file, and
 * the history the ML model uses. When the member has no loans in the system yet, the balance
 * carried over from UDEI's ledger goes in the Bookkeeper section, for the Bookkeeper to confirm.
 */
export function memberHistory(m: Member, h: MemberHistory, hasSystemLoans: boolean): Partial<Form> {
  return {
    memberId: m.memberId,
    ...(m.lastName ? { lastName: m.lastName, firstName: m.firstName ?? '', middleInitial: m.middleInitial ?? '' } : {}),
    ...(m.residenceAddress ? { residenceAddress: m.residenceAddress } : {}),
    ...(m.employer ? { employer: m.employer } : {}),
    ...(m.employmentStatus ? { employmentStatus: m.employmentStatus } : {}),
    yearsAsMember: String(h.yearsAsMember),
    priorLoans: String(h.priorLoans),
    priorLatePayments: String(h.priorLatePayments),
    ...(!hasSystemLoans && h.carriedBalance > 0 ? { longTermBalance: String(h.carriedBalance / 100) } : {}),
  }
}

/** GET /api/members/mine: a linked member's own record, history and last application. */
export type OwnRecord = {
  member: { lastName?: string; firstName?: string; middleInitial?: string; residenceAddress?: string; employer?: string; employmentStatus?: EmploymentStatus; dateOfBirth?: string } | null
  history: MemberHistory | null
  lastApplication: { lastName?: string; firstName?: string; middleInitial?: string; residenceAddress?: string; employer?: string; employmentStatus?: EmploymentStatus; dateOfBirth?: string; monthlySalary?: number; netTakeHomePay?: number; filedAt: string } | null
}

/** The applicant fields a linked member's form starts with: their record first, then their last application. */
export function fromOwnRecord(r: OwnRecord): Partial<Form> {
  const m = r.member ?? {}
  const last = r.lastApplication ?? { filedAt: '' }
  const pick = <K extends keyof typeof m & keyof typeof last>(k: K) => (m[k] || last[k] || undefined) as (typeof m)[K] | undefined
  const patch: Partial<Form> = {}
  const set = <K extends keyof Form>(k: K, v: Form[K] | undefined) => {
    if (v !== undefined && v !== '') patch[k] = v
  }
  set('lastName', pick('lastName'))
  set('firstName', pick('firstName'))
  set('middleInitial', pick('middleInitial'))
  set('residenceAddress', pick('residenceAddress'))
  set('employer', pick('employer'))
  set('employmentStatus', pick('employmentStatus'))
  const dob = pick('dateOfBirth')
  set('dateOfBirth', dob ? dob.slice(0, 10) : undefined)
  set('monthlySalary', last.monthlySalary ? String(last.monthlySalary) : undefined)
  set('netTakeHomePay', last.netTakeHomePay ? String(last.netTakeHomePay) : undefined)
  if (r.history) {
    patch.yearsAsMember = String(r.history.yearsAsMember)
    patch.priorLoans = String(r.history.priorLoans)
    patch.priorLatePayments = String(r.history.priorLatePayments)
  }
  return patch
}

/** A filed application back in the form, for the applicant to change it (until the Bookkeeper signs). */
export function formFromApplication(a: LoanApplication): Form {
  const p = a.applicant
  const b = a.bookkeeper
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : '')
  // Whole years show as years, like the form fills in; anything else in months.
  const years = a.loan.termMonths % 12 === 0
  return {
    ...emptyForm(),
    memberId: p.memberId ?? '',
    lastName: p.lastName,
    firstName: p.firstName,
    middleInitial: p.middleInitial ?? '',
    residenceAddress: p.residenceAddress,
    employer: p.employer,
    employmentStatus: p.employmentStatus,
    monthlySalary: String(p.monthlySalary),
    netTakeHomePay: String(p.netTakeHomePay),
    dateOfBirth: day(p.dateOfBirth),
    yearsAsMember: String(p.yearsAsMember ?? 0),
    priorLoans: String(p.priorLoans ?? 0),
    priorLatePayments: String(p.priorLatePayments ?? 0),
    applicationDate: day(a.agreement.applicationDate),
    loanType: a.loan.loanType,
    amount: String(a.loan.amount),
    purpose: a.loan.purpose ?? '',
    period: String(years ? a.loan.termMonths / 12 : a.loan.termMonths),
    periodUnit: years ? 'years' : 'months',
    monthlyRate: String(a.loan.monthlyRate),
    paymentFrequency: a.loan.paymentFrequency,
    paymentMode: a.loan.paymentMode ?? 'payroll',
    bonusType: a.loan.bonusType ?? '',
    longTermBalance: String(b?.longTermBalance ?? 0),
    longTermDueDate: day(b?.longTermDueDate),
    shortTermBalance: String(b?.shortTermBalance ?? 0),
    shortTermDueDate: day(b?.shortTermDueDate),
    monthlyPayment: String(b?.monthlyPayment ?? 0),
    payrollDeduction: a.agreement.payrollDeduction,
    autoRestructure: a.agreement.autoRestructure,
    coMaker1: a.coMakers?.[0]?.memberId ?? '',
    coMaker2: a.coMakers?.[1]?.memberId ?? '',
  }
}

export type ApplicantFields = Pick<Form, 'lastName' | 'firstName' | 'middleInitial' | 'residenceAddress' | 'employer' | 'monthlySalary' | 'netTakeHomePay'>

/** What analyzeDocument compares each document against. */
export const applicantOf = (f: ApplicantFields): Applicant => ({
  lastName: f.lastName.trim(),
  firstName: f.firstName.trim(),
  middleInitial: f.middleInitial.trim() || undefined,
  residenceAddress: f.residenceAddress.trim(),
  employer: f.employer.trim(),
  monthlySalary: num(f.monthlySalary),
  netTakeHomePay: num(f.netTakeHomePay),
})

/** The pages of the form, in order. Documents are checked by the page (they live outside Form). */
export const FORM_STEPS = ['applicant', 'loan', 'coMakers', 'documents', 'review'] as const
export type FormStep = (typeof FORM_STEPS)[number]

/**
 * The first problem with the fields on one page of the form, or '' when they are fine.
 * linked: the applicant has a full UDEI member number (see isLinkedMemberId).
 */
export function validateStep(step: FormStep, f: Form, settings: LoanSettings = FALLBACK_SETTINGS, linked = true): string {
  const limit = nonMemberLimit(settings, linked)
  if (step === 'applicant') {
    const salary = num(f.monthlySalary)
    const net = num(f.netTakeHomePay)
    if (!f.lastName.trim()) return 'Enter the last name.'
    if (!f.firstName.trim()) return 'Enter the first name.'
    if (f.residenceAddress.trim().length < 5) return 'Enter the residence address.'
    if (f.employer.trim().length < 2) return 'Enter the employer.'
    if (salary <= 0) return 'Enter the monthly salary.'
    if (net <= 0) return 'Enter the net take-home pay.'
    if (net > salary) return 'Net take-home pay cannot be more than the monthly salary.'
    if (net < MIN_NET_TAKE_HOME_PAY) return `The net take-home pay must be at least ₱${MIN_NET_TAKE_HOME_PAY.toLocaleString('en-PH')}.`
    if (salary < settings.minMonthlySalary) return `UDEI requires a monthly salary of at least ₱${settings.minMonthlySalary.toLocaleString('en-PH')}.`
    if (num(f.priorLatePayments) > num(f.priorLoans)) return 'Late payments cannot be more than past mutual assistance.'
    return ''
  }
  if (step === 'loan') {
    const term = termMonthsOf(f)
    const rate = Number(f.monthlyRate)
    if (!f.applicationDate) return 'Enter the application date.'
    if (num(f.amount) <= 0) return 'Choose the amount.'
    if (limit !== null && num(f.amount) > limit) return `Applicants who aren't linked to a UDEI member number can borrow at most ₱${limit.toLocaleString('en-PH')}.`
    if (f.purpose.trim().length < 3) return 'Give the reason for the mutual assistance.'
    const maxTerm = Math.min(MAX_TERM_MONTHS, settings.products[f.loanType].maxTermMonths)
    if (f.paymentMode === 'bonus') {
      if (!f.bonusType) return 'Choose which bonus it is charged to: Mid-year, Year-end, CNA or SRI.'
      const b = bonusOf(f, settings)
      if (b && b.months > maxTerm) return `The next ${b.label} is ${b.months} months away, more than the ${maxTerm} months ${settings.products[f.loanType].label} can run. Choose another bonus or mode of payment.`
    } else if (term < 1 || term > maxTerm) return `${settings.products[f.loanType].label} mutual assistance run 1 to ${maxTerm} months.`
    if (f.monthlyRate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 10) return 'The interest rate could not be loaded. Reload the page.'
    if (!f.payrollDeduction) return 'The applicant must authorize payroll deduction.'
    if (!f.autoRestructure) return 'The applicant must agree to automatic re-structuring.'
    return ''
  }
  if (step === 'coMakers') {
    const coMakers = [f.coMaker1, f.coMaker2].map((c) => c.trim()).filter(Boolean)
    if (coMakers.length < coMakersRequiredFor(settings, linked)) {
      return "Applicants who aren't linked to a UDEI member number need a co-maker: a UDEI member who vouches for this mutual assistance."
    }
    if (coMakers.length === 2 && coMakers[0] === coMakers[1]) return 'Name two different co-makers.'
    return ''
  }
  return ''
}

/** The first problem with the typed fields on any page, or '' when they are fine. Documents are checked separately. */
export function validateForm(f: Form, settings: LoanSettings = FALLBACK_SETTINGS, linked = true): string {
  for (const step of FORM_STEPS) {
    const problem = validateStep(step, f, settings, linked)
    if (problem) return problem
  }
  return ''
}

export type DocumentPayload = {
  fileName: string
  type?: string
  verdict?: DocumentAnalysis['verdict']
  sha256?: string
  notes?: string[]
  /** On a valid ID: the name the OCR read, shown to the Bookkeeper next to the declared name. */
  readName?: string
}

const optional = (s: string) => s.trim() || undefined

/** The request body for POST /api/applications (createSchema in server/src/routes/applications.js). */
export function buildPayload(f: Form, documents: DocumentPayload[]) {
  return {
    applicant: {
      lastName: f.lastName.trim(),
      firstName: f.firstName.trim(),
      middleInitial: optional(f.middleInitial),
      memberId: optional(f.memberId),
      residenceAddress: f.residenceAddress.trim(),
      employer: f.employer.trim(),
      employmentStatus: f.employmentStatus,
      monthlySalary: num(f.monthlySalary),
      netTakeHomePay: num(f.netTakeHomePay),
      dateOfBirth: optional(f.dateOfBirth),
      yearsAsMember: num(f.yearsAsMember),
      priorLoans: Math.trunc(num(f.priorLoans)),
      priorLatePayments: Math.trunc(num(f.priorLatePayments)),
    },
    loan: {
      loanType: f.loanType,
      amount: num(f.amount),
      termMonths: termMonthsOf(f),
      monthlyRate: Number(f.monthlyRate),
      paymentFrequency: f.paymentFrequency,
      paymentMode: f.paymentMode,
      bonusType: f.paymentMode === 'bonus' && f.bonusType ? f.bonusType : undefined,
      purpose: f.purpose.trim(),
    },
    bookkeeper: {
      longTermBalance: num(f.longTermBalance),
      longTermDueDate: optional(f.longTermDueDate),
      shortTermBalance: num(f.shortTermBalance),
      shortTermDueDate: optional(f.shortTermDueDate),
      monthlyPayment: num(f.monthlyPayment),
    },
    agreement: {
      payrollDeduction: f.payrollDeduction,
      autoRestructure: f.autoRestructure,
      applicationDate: f.applicationDate,
    },
    coMakers: [f.coMaker1, f.coMaker2].map((c) => c.trim()).filter(Boolean),
    documents,
  }
}

/** A date written out for a printed form, "November 25, 2026" ('' when missing). */
export const longDate = (iso: string | Date | undefined | null) => {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso) : iso
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}
