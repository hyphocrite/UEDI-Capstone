// Sample data for the UI. These will be replaced by API calls once
// UEDI's process for members, loans and plans is wired to MongoDB.

export type MemberStatus = 'Active' | 'Inactive'

export type Member = {
  id: string
  name: string
  phone: string
  email: string
  branch: string
  joined: string
  status: MemberStatus
}

export type LoanStatus = 'Active' | 'Past due' | 'Fully paid' | 'Pending'

export type Loan = {
  id: string
  memberId: string
  product: string
  principal: number
  annualRate: number
  termMonths: number
  releasedAt: string
  amountPaid: number
  status: LoanStatus
}

export type PlanStatus = 'On track' | 'Behind' | 'Completed'

export type RetirementPlan = {
  id: string
  memberId: string
  planName: string
  contractAmount: number
  amountPaid: number
  monthlyDue: number
  startDate: string
  termYears: number
  nextDueDate: string | null
  status: PlanStatus
}

export type InterestRate = {
  id: string
  product: string
  annualRate: number
  maxTermMonths: number
  serviceFee: number
  penaltyRate: number
}

export const branches = ['Main Office', 'North Branch', 'South Branch']

export const members: Member[] = [
  { id: 'M-0001', name: 'Maria Santos', phone: '09171234567', email: 'maria.santos@mail.com', branch: 'Main Office', joined: '2019-03-14', status: 'Active' },
  { id: 'M-0002', name: 'Jose Reyes', phone: '09182345678', email: 'jose.reyes@mail.com', branch: 'North Branch', joined: '2020-07-02', status: 'Active' },
  { id: 'M-0003', name: 'Ana Dela Cruz', phone: '09193456789', email: 'ana.delacruz@mail.com', branch: 'Main Office', joined: '2018-11-21', status: 'Active' },
  { id: 'M-0004', name: 'Ramon Bautista', phone: '09204567890', email: 'ramon.b@mail.com', branch: 'South Branch', joined: '2021-01-09', status: 'Active' },
  { id: 'M-0005', name: 'Liza Mendoza', phone: '09215678901', email: 'liza.mendoza@mail.com', branch: 'North Branch', joined: '2017-05-30', status: 'Active' },
  { id: 'M-0006', name: 'Carlo Villanueva', phone: '09226789012', email: 'carlo.v@mail.com', branch: 'Main Office', joined: '2022-09-15', status: 'Inactive' },
  { id: 'M-0007', name: 'Grace Aquino', phone: '09237890123', email: 'grace.aquino@mail.com', branch: 'South Branch', joined: '2016-02-11', status: 'Active' },
  { id: 'M-0008', name: 'Paolo Garcia', phone: '09248901234', email: 'paolo.garcia@mail.com', branch: 'Main Office', joined: '2023-04-18', status: 'Active' },
  { id: 'M-0009', name: 'Teresa Ramos', phone: '09259012345', email: 'teresa.ramos@mail.com', branch: 'North Branch', joined: '2015-08-25', status: 'Active' },
  { id: 'M-0010', name: 'Miguel Torres', phone: '09260123456', email: 'miguel.torres@mail.com', branch: 'South Branch', joined: '2024-01-07', status: 'Active' },
]

export const interestRates: InterestRate[] = [
  { id: 'regular', product: 'Regular Loan', annualRate: 12, maxTermMonths: 36, serviceFee: 2, penaltyRate: 2 },
  { id: 'emergency', product: 'Emergency Loan', annualRate: 10, maxTermMonths: 12, serviceFee: 1, penaltyRate: 2 },
  { id: 'salary', product: 'Salary Loan', annualRate: 14, maxTermMonths: 24, serviceFee: 2, penaltyRate: 3 },
  { id: 'plan-backed', product: 'Retirement Plan-Backed Loan', annualRate: 8, maxTermMonths: 60, serviceFee: 1, penaltyRate: 1.5 },
]

export const loans: Loan[] = [
  { id: 'L-2026-001', memberId: 'M-0001', product: 'Regular Loan', principal: 80000, annualRate: 12, termMonths: 24, releasedAt: '2026-01-15', amountPaid: 32000, status: 'Active' },
  { id: 'L-2026-002', memberId: 'M-0002', product: 'Emergency Loan', principal: 20000, annualRate: 10, termMonths: 12, releasedAt: '2026-03-02', amountPaid: 12500, status: 'Active' },
  { id: 'L-2026-003', memberId: 'M-0004', product: 'Salary Loan', principal: 50000, annualRate: 14, termMonths: 18, releasedAt: '2025-11-20', amountPaid: 18000, status: 'Past due' },
  { id: 'L-2025-014', memberId: 'M-0003', product: 'Regular Loan', principal: 60000, annualRate: 12, termMonths: 12, releasedAt: '2025-02-10', amountPaid: 67200, status: 'Fully paid' },
  { id: 'L-2026-004', memberId: 'M-0005', product: 'Retirement Plan-Backed Loan', principal: 150000, annualRate: 8, termMonths: 48, releasedAt: '2026-02-01', amountPaid: 26000, status: 'Active' },
  { id: 'L-2026-005', memberId: 'M-0007', product: 'Regular Loan', principal: 100000, annualRate: 12, termMonths: 36, releasedAt: '2026-06-12', amountPaid: 9900, status: 'Active' },
  { id: 'L-2026-006', memberId: 'M-0008', product: 'Emergency Loan', principal: 15000, annualRate: 10, termMonths: 6, releasedAt: '2026-09-20', amountPaid: 0, status: 'Pending' },
  { id: 'L-2026-007', memberId: 'M-0009', product: 'Salary Loan', principal: 40000, annualRate: 14, termMonths: 12, releasedAt: '2026-04-05', amountPaid: 20500, status: 'Active' },
  { id: 'L-2026-008', memberId: 'M-0010', product: 'Regular Loan', principal: 30000, annualRate: 12, termMonths: 12, releasedAt: '2026-05-18', amountPaid: 7800, status: 'Past due' },
]

export const retirementPlans: RetirementPlan[] = [
  { id: 'RP-1001', memberId: 'M-0001', planName: 'Standard Plan (15 years)', contractAmount: 540000, amountPaid: 252000, monthlyDue: 3000, startDate: '2019-04-01', termYears: 15, nextDueDate: '2026-10-01', status: 'On track' },
  { id: 'RP-1002', memberId: 'M-0003', planName: 'Premium Plan (20 years)', contractAmount: 960000, amountPaid: 376000, monthlyDue: 4000, startDate: '2018-12-01', termYears: 20, nextDueDate: '2026-10-01', status: 'On track' },
  { id: 'RP-1003', memberId: 'M-0004', planName: 'Basic Plan (10 years)', contractAmount: 240000, amountPaid: 92000, monthlyDue: 2000, startDate: '2021-02-01', termYears: 10, nextDueDate: '2026-08-01', status: 'Behind' },
  { id: 'RP-1004', memberId: 'M-0005', planName: 'Premium Plan (20 years)', contractAmount: 960000, amountPaid: 452000, monthlyDue: 4000, startDate: '2017-06-01', termYears: 20, nextDueDate: '2026-10-01', status: 'On track' },
  { id: 'RP-1005', memberId: 'M-0007', planName: 'Standard Plan (15 years)', contractAmount: 540000, amountPaid: 381000, monthlyDue: 3000, startDate: '2016-03-01', termYears: 15, nextDueDate: '2026-10-01', status: 'On track' },
  { id: 'RP-1006', memberId: 'M-0009', planName: 'Basic Plan (10 years)', contractAmount: 240000, amountPaid: 240000, monthlyDue: 2000, startDate: '2015-09-01', termYears: 10, nextDueDate: null, status: 'Completed' },
  { id: 'RP-1007', memberId: 'M-0010', planName: 'Basic Plan (10 years)', contractAmount: 240000, amountPaid: 14000, monthlyDue: 2000, startDate: '2024-02-01', termYears: 10, nextDueDate: '2026-07-01', status: 'Behind' },
]

export const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id

/** Total the member repays: simple add-on interest, as many coops use. */
export const loanTotalDue = (l: Loan) =>
  Math.round(l.principal * (1 + (l.annualRate / 100) * (l.termMonths / 12)))

export const loanBalance = (l: Loan) => Math.max(0, loanTotalDue(l) - l.amountPaid)

export const planBalance = (p: RetirementPlan) => Math.max(0, p.contractAmount - p.amountPaid)

export const planMonthsLeft = (p: RetirementPlan) =>
  p.monthlyDue > 0 ? Math.ceil(planBalance(p) / p.monthlyDue) : 0

// ---- Reports -------------------------------------------------------------

export type ReportPeriod = 'daily' | 'monthly' | 'yearly'

export type ReportRow = {
  label: string
  loansReleased: number
  loanCollections: number
  planPayments: number
  newLoans: number
  newPlans: number
}

// Deterministic pseudo-random numbers so the sample report looks the same on every load.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function makeRow(label: string, scale: number, rand: () => number): ReportRow {
  const r = () => 0.6 + rand() * 0.8
  return {
    label,
    loansReleased: Math.round(85000 * scale * r() / 100) * 100,
    loanCollections: Math.round(62000 * scale * r() / 100) * 100,
    planPayments: Math.round(41000 * scale * r() / 100) * 100,
    newLoans: Math.max(0, Math.round(3 * scale * r())),
    newPlans: Math.max(0, Math.round(1.2 * scale * r())),
  }
}

export function buildReport(period: ReportPeriod, today = new Date('2026-09-29')): ReportRow[] {
  const rand = seeded(period === 'daily' ? 11 : period === 'monthly' ? 23 : 37)
  if (period === 'daily') {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (13 - i))
      const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      return makeRow(label, 1, rand)
    })
  }
  if (period === 'monthly') {
    return Array.from({ length: today.getMonth() + 1 }, (_, m) => {
      const label = new Date(today.getFullYear(), m, 1).toLocaleDateString('en-PH', { month: 'short' })
      return makeRow(label, 22, rand)
    })
  }
  return Array.from({ length: 6 }, (_, i) => makeRow(String(today.getFullYear() - 5 + i), 22 * 12 * (0.7 + i * 0.08), rand))
}
