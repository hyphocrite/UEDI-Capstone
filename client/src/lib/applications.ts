// Types for loan applications as the API returns them.

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
  bookkeeper?: {
    longTermBalance: number
    longTermDueDate?: string
    shortTermBalance: number
    shortTermDueDate?: string
  }
  agreement: { payrollDeduction: boolean; autoRestructure: boolean; applicationDate: string }
  documents: { fileName: string; type?: string; verdict?: 'verified' | 'review' | 'mismatch' | 'unreadable'; notes?: string[] }[]
  status: 'pending' | 'approved' | 'denied'
  assessment?: Assessment
  assessmentError?: string
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

export type ModelInfo = {
  version: string
  trainedAt: string
  rows: number
  defaultRate: number
  sampleData: boolean
  validation: string
  models: Record<string, CvMetrics>
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
 * Monthly installment with add-on interest: the monthly rate is charged on the full amount
 * for every month (ml-service/uedi_ml/features.py does the same). Quincenal deductions are half.
 */
export const monthlyInstallment = (l: Pick<LoanApplication['loan'], 'amount' | 'termMonths' | 'monthlyRate'>) =>
  (l.amount * (1 + (l.monthlyRate / 100) * l.termMonths)) / Math.max(l.termMonths, 1)
