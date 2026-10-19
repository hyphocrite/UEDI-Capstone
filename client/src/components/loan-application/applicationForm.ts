// State, validation and request body for the Mutual Assistance Application Form.
import { loans } from '../../data/mock'
import type { Member } from '../../data/mock'
import { monthlyInstallment } from '../../lib/applications'
import type { EmploymentStatus, LoanType } from '../../lib/applications'
import type { Applicant, DocumentAnalysis } from '../../lib/ocr/analyzeDocument'

export type PeriodUnit = 'years' | 'months'
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
  monthlyRate: string
  /** True once the user types a rate, so switching loan type no longer resets it. */
  rateEdited: boolean
  paymentFrequency: PaymentFrequency

  longTermBalance: string
  longTermDueDate: string
  shortTermBalance: string
  shortTermDueDate: string

  payrollDeduction: boolean
  autoRestructure: boolean
}

export const MAX_TERM_MONTHS = 120

/** UEDI's usual rates, in % per month. */
export const DEFAULT_RATE: Record<LoanType, string> = { long_term: '1.0', emergency: '1.5' }

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
  monthlyRate: DEFAULT_RATE.long_term,
  rateEdited: false,
  paymentFrequency: 'quincenal',

  longTermBalance: '0',
  longTermDueDate: '',
  shortTermBalance: '0',
  shortTermDueDate: '',

  payrollDeduction: false,
  autoRestructure: false,
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
  const left = net - inst.monthly
  if (inst.monthly > net / 2) return 'The monthly installment is more than half of the net take-home pay.'
  if (left < 5000) return 'Less than ₱5,000 of the net take-home pay is left after the monthly installment.'
  return null
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

/** Prefills what UEDI already knows about a member. */
export function memberHistory(m: Member): Partial<Form> {
  const past = loans.filter((l) => l.memberId === m.id && l.status !== 'Pending')
  const years = Math.max(0, Math.floor((Date.now() - new Date(m.joined).getTime()) / (365.25 * 86_400_000)))
  return {
    memberId: m.id,
    ...splitName(m.name),
    yearsAsMember: String(years),
    priorLoans: String(past.length),
    priorLatePayments: String(past.filter((l) => l.status === 'Past due').length),
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

/** Returns the first problem with the typed fields, or '' when they are fine. Documents are checked separately. */
export function validateForm(f: Form): string {
  const salary = num(f.monthlySalary)
  const net = num(f.netTakeHomePay)
  const term = termMonthsOf(f)
  const rate = Number(f.monthlyRate)

  if (!f.lastName.trim()) return 'Enter the last name.'
  if (!f.firstName.trim()) return 'Enter the first name.'
  if (f.residenceAddress.trim().length < 5) return 'Enter the residence address.'
  if (f.employer.trim().length < 2) return 'Enter the employer.'
  if (salary <= 0) return 'Enter the monthly salary.'
  if (net <= 0) return 'Enter the net take-home pay.'
  if (net > salary) return 'Net take-home pay cannot be more than the monthly salary.'
  if (num(f.priorLatePayments) > num(f.priorLoans)) return 'Late payments cannot be more than past loans.'
  if (!f.applicationDate) return 'Enter the application date.'
  if (num(f.amount) <= 0) return 'Enter the loan amount.'
  if (term < 1 || term > MAX_TERM_MONTHS) return `The period must be 1 to ${MAX_TERM_MONTHS} months (10 years).`
  if (f.monthlyRate.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 10) return 'Enter a rate from 0 to 10% per month.'
  if (!f.payrollDeduction) return 'The applicant must authorize payroll deduction.'
  if (!f.autoRestructure) return 'The applicant must agree to automatic re-structuring.'
  return ''
}

export type DocumentPayload = {
  fileName: string
  type?: string
  verdict?: DocumentAnalysis['verdict']
  sha256?: string
  notes?: string[]
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
      purpose: optional(f.purpose),
    },
    bookkeeper: {
      longTermBalance: num(f.longTermBalance),
      longTermDueDate: optional(f.longTermDueDate),
      shortTermBalance: num(f.shortTermBalance),
      shortTermDueDate: optional(f.shortTermDueDate),
    },
    agreement: {
      payrollDeduction: f.payrollDeduction,
      autoRestructure: f.autoRestructure,
      applicationDate: f.applicationDate,
    },
    documents,
  }
}
