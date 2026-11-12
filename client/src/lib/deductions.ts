// Payroll deduction runs as /api/deductions returns them. Amounts are integer centavos.
import type { LoanType } from './applications'

export type RunStatus = 'draft' | 'sent' | 'posted'
export type LineResult = 'full' | 'partial' | 'missed'
export type MissReason = 'lwop' | 'separated' | 'insufficient_pay' | 'not_in_payroll' | 'other'

export const reasonLabel: Record<MissReason, string> = {
  lwop: 'Leave without pay',
  separated: 'Separated from DNSC',
  insufficient_pay: 'Insufficient pay',
  not_in_payroll: 'Not in payroll',
  other: 'Other',
}

export const runStatusLabel: Record<RunStatus, string> = { draft: 'Draft', sent: 'Sent to payroll', posted: 'Posted' }

export type RunLine = {
  _id: string
  loan: string
  loanNo: string
  memberId?: string
  borrowerName: string
  loanType: LoanType
  expected: number
  arrears: number
  remitted?: number
  result?: LineResult
  reason?: MissReason
  reasonNote?: string
  removed?: boolean
  removedReason?: string
}

export type RunTotals = { members: number; lines: number; expected: number; arrears: number; remitted: number; missed: number; partial: number }

export type DeductionRun = {
  _id: string
  cutoff: string
  cutoffDate: string
  status: RunStatus
  lines: RunLine[]
  totals: RunTotals
  remittance?: { officialReceiptNo?: string; amountReceived?: number; receivedAt?: string }
  createdByName?: string
  sentAt?: string
  sentByName?: string
  postedAt?: string
  postedByName?: string
  unposts?: { reason: string; byName?: string; at: string }[]
  createdAt: string
}

export type RunSummary = Omit<DeductionRun, 'lines'> & { lineCount: number }

/** Same rule as the server: full when at least the expected amount was deducted, partial when some, missed when none. */
export function lineResult(expected: number, remitted: number, reason?: string): LineResult {
  if (remitted === 0 && (expected > 0 || reason)) return 'missed'
  if (remitted < expected) return 'partial'
  return 'full'
}

/** POST /api/deductions/:id/import: remitted amounts matched by loan no., and rows that didn't match. */
export type ImportResult = {
  updates: { lineId?: string; loanNo: string; remitted: number }[]
  problems: { row: number; loanNo?: string; message: string }[]
}

/** Cutoff date as "Oct 31, 2026" (calendar day, formatted in UTC so it never shifts). */
export const formatCutoff = (key: string) =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
