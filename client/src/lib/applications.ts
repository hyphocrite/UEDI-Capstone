// Types for loan applications as the API returns them.
import type { ApprovalStep } from './roles'

export type Suggestion = 'approve' | 'review' | 'deny'

export type Factor = { feature: string; label: string; value: number; impact: number; direction: string }

export type CvMetrics = { name: string; aucRoc: number; accuracy: number; precision: number; recall: number; f1: number }

export type ModelScore = {
  key: 'xgboost' | 'random_forest' | 'logistic_regression'
  name: string
  defaultProbability: number
  suggestion: Suggestion
  topFactors: Factor[]
  cvMetrics?: CvMetrics
}

export type Assessment = {
  ensemble: {
    name: string
    defaultProbability: number
    suggestion: Suggestion
    modelWeights: Record<string, number>
    cvMetrics?: CvMetrics
  }
  models: ModelScore[]
  thresholds: { approve: number; deny: number }
  modelVersion?: string
  assessedAt?: string
}

export type LoanApplication = {
  _id: string
  applicationNo: string
  applicant: {
    lastName: string
    firstName: string
    middleInitial?: string
    fullName: string
    memberId?: string
    residenceAddress: string
    employer: string
    employmentStatus: EmploymentStatus
    monthlySalary: number
    netTakeHomePay: number
    dateOfBirth?: string
    yearsAsMember: number
    priorLoans: number
    priorLatePayments: number
  }
  loan: {
    loanType: LoanType
    amount: number
    termMonths: number
    /** Percent per month, as on UEDI's form. */
    monthlyRate: number
    paymentFrequency: 'quincenal' | 'monthly'
    purpose?: string
  }
  /** Amounts in pesos. source: filled from the ledger, or typed for loans that predate the system. */
  bookkeeper?: {
    source?: 'ledger' | 'manual'
    asOf?: string
    monthlyPayment?: number
    loans?: { loanNo: string; loanType: LoanType; balance: number; maturity?: string }[]
    longTermBalance: number
    longTermDueDate?: string
    shortTermBalance: number
    shortTermDueDate?: string
  }
  agreement: { payrollDeduction: boolean; autoRestructure: boolean; applicationDate: string }
  documents: { fileName: string; type?: string; verdict?: 'verified' | 'review' | 'mismatch' | 'unreadable'; notes?: string[] }[]
  status: 'pending' | 'approved' | 'denied'
  /** Signatures so far, in order. */
  approvals: Approval[]
  /** The step waiting to be signed, or 'none' once decided. */
  currentStep: ApprovalStep | 'none'
  /** The loan created when the President approved. */
  loanId?: string
  loanNo?: string
  assessment?: Assessment
  assessmentError?: string
  /** Single-officer decision from before the approval chain; shown for old applications only. */
  decision?: {
    decision: 'approved' | 'denied'
    note?: string
    followedSuggestion?: boolean
    decidedByName?: string
    decidedAt?: string
  }
  submittedByName?: string
  createdAt: string
}

export type Approval = {
  step: ApprovalStep
  decision: 'approved' | 'denied'
  note?: string
  /** User id of the signer. */
  signedBy?: string
  signedByName?: string
  signedAt: string
  followedSuggestion?: boolean
}

export type ModelInfo = {
  version: string
  trainedAt: string
  rows: number
  defaultRate: number
  sampleData: boolean
  validation: string
  models: Record<string, CvMetrics>
  thresholds?: { approve: number; deny: number }
}

/** One model's row from ml-service/benchmark.py: means and standard deviations over 25 test folds. */
export type BenchmarkRow = {
  model: string
  aucRoc: number
  aucRocSd: number
  accuracy: number
  precision: number
  recall: number
  f1: number
}

export type BenchmarkDataset = {
  key: 'german_credit' | 'sample_loans'
  name: string
  rows: number
  bad: number
  validation: string
  results: BenchmarkRow[]
}

/** [[good passed, good flagged], [bad missed, bad caught]] per model, from plot_results.py. */
export type ConfusionMatrix = [[number, number], [number, number]]

export type Benchmark = {
  datasets: BenchmarkDataset[]
  confusion: { cutoff: string; matrices: Record<string, Record<string, ConfusionMatrix>> } | null
}

export type LoanType = 'long_term' | 'emergency'
export type EmploymentStatus = 'permanent' | 'temporary' | 'contractual' | 'job_order'

export const loanTypeLabel: Record<LoanType, string> = { long_term: 'Long term', emergency: 'Emergency' }

export const employmentStatusLabel: Record<EmploymentStatus, string> = {
  permanent: 'Permanent',
  temporary: 'Temporary',
  contractual: 'Contractual',
  job_order: 'Job order / contract of service',
}

/**
 * Monthly installment with interest on the remaining balance, as UEDI's ledger charges it
 * (ml-service/uedi_ml/features.py does the same). Quincenal deductions are half.
 */
export const monthlyInstallment = (l: Pick<LoanApplication['loan'], 'amount' | 'termMonths' | 'monthlyRate'>) => {
  const n = Math.max(l.termMonths, 1)
  const r = l.monthlyRate / 100
  return r > 0 ? (l.amount * r) / (1 - (1 + r) ** -n) : l.amount / n
}
