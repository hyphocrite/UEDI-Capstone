// Types for loan applications as the API returns them.
import type { ApprovalStep } from './roles'

export type Suggestion = 'approve' | 'review' | 'deny'

export type Factor = { feature: string; label: string; value: number; impact: number; direction: string }

export type Explanation = {
  against: { feature: string; text: string }[]
  inFavor?: { feature: string; text: string }[]
  tips: string[]
}

/** Cross-validated regression metrics: MAE and RMSE in score points, R² from 0 to 1. */
export type CvMetrics = { name: string; mae: number; rmse: number; r2: number }

/** A predicted credit score. `defaultProbability` only exists on applications scored by the old classifier. */
export type Scored = { creditScore?: number; defaultProbability?: number }

export type ModelScore = Scored & {
  key: 'xgboost' | 'random_forest' | 'linear_regression' | 'ridge' | 'decision_tree' | 'logistic_regression'
  name: string
  suggestion: Suggestion
  topFactors: Factor[]
  cvMetrics?: CvMetrics
}

export type Assessment = {
  ensemble: Scored & {
    name: string
    suggestion: Suggestion
    modelWeights: Record<string, number>
    cvMetrics?: CvMetrics
  }
  models: ModelScore[]
  thresholds: { approve: number; deny: number }
  modelVersion?: string
  assessedAt?: string
  /** SHAP waterfall for the stacked ensemble (staff only); missing on applications scored before it existed. */
  shap?: ShapWaterfall
}

/**
 * SHAP waterfall in credit score points (scale 'points', the regression model):
 * baseValue + sum(factors[].shap) + otherFeatures = output, and creditScore = output clipped to 0–100.
 * Positive values raise the score. Applications scored by the old classifier have scale 'log-odds',
 * outputProbability = sigmoid(output), and positive values push toward default.
 */
export type ShapWaterfall = {
  model: 'ensemble' | 'xgboost'
  scale: 'points' | 'log-odds'
  baseValue: number
  factors: { feature: string; label: string; value: number; shap: number }[]
  otherFeatures: number
  output: number
  creditScore?: number
  outputProbability?: number
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
  /** fileId is set once the file itself was uploaded and can be opened in the viewer. */
  documents: { fileName: string; type?: string; verdict?: 'verified' | 'review' | 'mismatch' | 'unreadable'; notes?: string[]; fileId?: string; contentType?: string; size?: number; addedAt?: string }[]
  status: 'pending' | 'approved' | 'denied'
  /** Members vouching for the loan; signing waits until all have accepted. */
  coMakers?: { memberId: string; name?: string; status: 'pending' | 'accepted' | 'declined'; respondedAt?: string; note?: string }[]
  /** The models' reasons in plain words. Staff always; members only once denied (no inFavor). */
  explanation?: Explanation | null
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
  /** Who filed it: only they can change it or add documents. */
  submittedBy?: string
  /** When the applicant last changed the form (allowed until the Bookkeeper signs). */
  editedAt?: string
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
  task?: 'regression'
  targetMean?: number
  poorRepaymentShare?: number
  sampleData: boolean
  validation: string
  members?: string[]
  models: Record<string, CvMetrics>
  thresholds?: { approve: number; deny: number }
  errorTypes?: { poorRepaymentBelow: number; typeIRate: number; typeIIRate: number; precision: number; recall: number }
  /** SHAP summary: mean absolute SHAP value per feature for the stacked ensemble, in score points, largest first. */
  globalImportance?: { feature: string; label: string; meanAbsShap: number }[]
}

/** One model's row from ml-service/benchmark.py: means and standard deviations over the test folds. */
export type BenchmarkRow = {
  model: string
  mae: number
  maeSd: number
  rmse: number
  rmseSd: number
  r2: number
  r2Sd: number
  members?: string[]
  usedByApp?: boolean
}

export type BenchmarkDataset = {
  key: 'uedi_loans' | 'sample_loans'
  name: string
  rows: number
  targetMean: number
  validation: string
  results: BenchmarkRow[]
}

/** [[good repayer: suggested approve, flagged], [poor repayer: suggested approve, flagged]] per model, from plot_results.py. */
export type ConfusionMatrix = [[number, number], [number, number]]

export type Benchmark = {
  datasets: BenchmarkDataset[]
  errorTypes: {
    poorRepaymentBelow: number
    approveLine: number
    models: Record<string, { matrix: ConfusionMatrix; typeIRate: number; typeIIRate: number }>
  } | null
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

/** Pending, at the caller's step, and not already signed by them (same rule as GET /api/applications?awaiting=me). */
export const awaitingUser = (a: LoanApplication, role: string | undefined, userId: string | undefined) =>
  a.status === 'pending' && a.currentStep === role && !a.approvals.some((x) => x.signedBy === userId)

/** The person who filed it may change the form until the Bookkeeper signs (server: PUT /api/applications/:id). */
export const canChange = (a: LoanApplication, userId: string | undefined) =>
  !!userId && a.submittedBy === userId && a.status === 'pending' && a.approvals.length === 0

/** ...and add supporting documents until it is decided, after signatures too (POST /api/applications/:id/documents). */
export const canAddDocuments = (a: LoanApplication, userId: string | undefined) =>
  !!userId && a.submittedBy === userId && a.status === 'pending'

/**
 * The credit score (0 to 100, higher is safer, two decimals). The regression model predicts it
 * directly (creditScore). Applications scored by the old classifier only have defaultProbability,
 * shown as 100 × (1 − p). Not for the early-warning model, which stays a percentage.
 */
export const creditScore = (s: Scored) =>
  Math.round(100 * (s.creditScore ?? 100 * (1 - (s.defaultProbability ?? 0)))) / 100

/**
 * A suggestion cut-off on the credit score scale. The regression model stores score lines
 * (e.g. approve 85, deny 68); the old classifier stored chances of default (e.g. 0.05), shown as 100 × (1 − p).
 */
export const scoreLine = (t: number) => (t > 1 ? t : 100 * (1 - t))
