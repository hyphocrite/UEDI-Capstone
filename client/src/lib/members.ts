import type { EmploymentStatus } from './applications'

export type MemberStatus = 'active' | 'inactive'

/** A UDEI member record (GET /api/members). Amounts in centavos. */
export type Member = {
  _id: string
  memberId: string
  fullName: string
  lastName?: string
  firstName?: string
  middleInitial?: string
  phone?: string
  email?: string
  branch?: string
  residenceAddress?: string
  employer?: string
  employmentStatus?: EmploymentStatus
  dateOfBirth?: string
  joinedAt?: string
  status: MemberStatus
  remarks?: string
  openingLoan?: {
    asOf: string
    balanceStartOfYear: number
    appliedThisYear: number
    payments: number
    interest: number
    balance: number
    loansThisYear: number
  }
  updatedByName?: string
  // List only
  openLoans?: number
  loanBalance?: number
  plan?: { id: string; balance: number; monthlyContribution: number; status: PlanStatus } | null
}

export type MemberHistory = {
  yearsAsMember: number
  priorLoans: number
  priorLatePayments: number
  carriedBalance: number
  carriedAsOf: string | null
}

export type PlanStatus = 'up_to_date' | 'behind'

export type Contribution = {
  _id: string
  month: string
  amount: number
  dues: number
  paidAt: string
  method: 'payroll' | 'cash' | 'other'
  reference?: string
  source: 'manual' | 'import'
  recordedByName?: string
  voided: boolean
  voidReason?: string
  voidedByName?: string
}

/** A retirement plan (GET /api/retirement-plans). Amounts in centavos. */
export type RetirementPlan = {
  _id: string
  memberId: string
  memberName: string
  startDate: string
  monthlyContribution: number
  planShare: number
  duesShare: number
  openingBalance: number
  openingAsOf?: string
  contributions: Contribution[]
  balance: number
  contributedThisYear: number
  duesThisYear: number
  lastMonthPaid: string | null
  missedMonths: string[]
  status: PlanStatus
}

export const planStatusLabel: Record<PlanStatus, string> = { up_to_date: 'Up to date', behind: 'Behind' }
export const memberStatusLabel: Record<MemberStatus, string> = { active: 'Active', inactive: 'Inactive' }

/** "2026-05" as "May 2026". */
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Sorts member IDs as UDEI numbers them: 2 before 10, then S-1, S-2. */
export const byMemberId = (a: { memberId: string }, b: { memberId: string }) =>
  a.memberId.localeCompare(b.memberId, 'en', { numeric: true })
