// The supporting documents UEDI asks for with a Mutual Assistance application.
// Each one proves fields on the paper form:
//   Name ............ valid ID, payslip, proof of address
//   Residence address  proof of address (and IDs that print an address)
//   Employer ......... payslip, DNSC ID, certificate of employment
//   Monthly salary ... payslip (basic salary), certificate of employment
//   Net take-home pay  payslip (net pay)
// To add a type, add an entry here: detection keywords and which checks to run.

export type DocumentTypeId =
  | 'valid_id'
  | 'employee_id'
  | 'payslip'
  | 'certificate_of_employment'
  | 'proof_of_address'
  | 'application_form'
  | 'other'

export type CheckId =
  | 'name'
  | 'address'
  | 'employer'
  | 'salary'
  | 'netPay'
  | 'recent'
  | 'notExpired'
  | 'idNumber'
  | 'signature'

export type DocumentType = {
  id: DocumentTypeId
  label: string
  /** Shown under the upload button: what to photograph. */
  hint: string
  keywords: RegExp[]
  checks: CheckId[]
  /** Documents with a date must be at most this many days old. */
  maxAgeDays?: number
}

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: 'valid_id',
    label: 'Valid government ID',
    hint: 'PhilSys national ID, UMID, driver’s license, passport or postal ID. Front side, flat, no glare.',
    keywords: [/republic\s+of\s+the\s+philippines/i, /driver'?s?\s+licen[cs]e/i, /\bumid\b/i, /philsys|philippine\s+identification|national\s+id|pambansang/i, /passport|pasaporte/i, /social\s+security|\bgsis\b/i, /postal\s+id/i, /land\s+transportation/i, /identification\s+card/i, /date\s+of\s+birth|petsa\s+ng\s+kapanganakan/i],
    checks: ['name', 'notExpired', 'idNumber', 'address'],
  },
  {
    id: 'employee_id',
    label: 'DNSC employee ID',
    hint: 'Your DNSC ID card, front side.',
    keywords: [/davao\s+del\s+norte\s+state\s+college|\bdnsc\b/i, /employee|faculty|personnel|staff/i, /(?:employee|id)\s*(?:no|number|#)/i, /identification|\bid\b\s*card/i],
    checks: ['name', 'employer', 'idNumber'],
  },
  {
    id: 'payslip',
    label: 'Latest payslip',
    hint: 'Your most recent DNSC payslip, showing basic salary and net pay. The whole slip in the photo.',
    keywords: [/pay\s*slip|pay\s*advice|payroll/i, /net\s*(?:pay|amount|take\s*home)/i, /gross\s*(?:pay|income|earnings|amount)/i, /pay\s*period|quincena|semi[-\s]?monthly/i, /basic\s*(?:pay|salary)|monthly\s*salary/i, /deductions?/i, /withholding\s+tax|\bw\/?tax\b/i, /\bgsis\b|philhealth|pag-?ibig|\bhdmf\b/i, /\bpera\b/i],
    checks: ['name', 'employer', 'salary', 'netPay', 'recent'],
    maxAgeDays: 60,
  },
  {
    id: 'certificate_of_employment',
    label: 'Certificate of employment',
    hint: 'Signed by DNSC HR, showing position and salary.',
    keywords: [/certificate\s+of\s+employment|service\s+record/i, /this\s+is\s+to\s+certify/i, /(?:has\s+been|is\s+currently|is\s+a)\s+(?:employed|permanent|regular)/i, /position|designation|plantilla/i, /human\s+resources?|\bhrmo\b|personnel/i],
    checks: ['name', 'employer', 'salary', 'recent'],
    maxAgeDays: 180,
  },
  {
    id: 'proof_of_address',
    label: 'Proof of address',
    hint: 'Barangay certificate of residency, cedula, or a recent electric or water bill in your name.',
    keywords: [/barangay\s+(?:certificat|clearance)|certificate\s+of\s+residency|bona\s*fide\s+resident|resident\s+of/i, /punong\s+barangay|barangay\s+captain|sangguniang\s+barangay/i, /community\s+tax|cedula/i, /davao\s+light|\bdlpc\b|water\s+district|electric\s+cooperative|\bnorde[cl]o\b/i, /statement\s+of\s+account|billing\s+(?:period|date|statement)|due\s+date/i, /\bkwh\b|cu\.?\s*m/i, /this\s+is\s+to\s+certify/i],
    checks: ['name', 'address', 'recent'],
    maxAgeDays: 180,
  },
  {
    id: 'application_form',
    label: 'Signed application form',
    hint: 'Photo of the signed Mutual Assistance Application Form. The signature authorizes payroll deduction.',
    keywords: [/united\s+dnsc\s+employees/i, /mutual\s+assistance/i, /application\s+(?:form|agreement)/i, /signature\s+of\s+the\s+applicant/i, /credit\s+committee|crecom/i, /payroll\s+officer/i, /re-?structur/i],
    checks: ['name', 'signature'],
  },
  {
    id: 'other',
    label: 'Other document',
    hint: 'Anything else the loan officer asked for.',
    keywords: [],
    checks: ['name'],
  },
]

export type LoanType = 'long_term' | 'emergency'

/** Documents the applicant must upload, by loan type. Change here to change the checklist. */
export const REQUIRED_DOCUMENTS: Record<LoanType, DocumentTypeId[]> = {
  long_term: ['valid_id', 'payslip', 'proof_of_address', 'application_form'],
  emergency: ['valid_id', 'payslip', 'application_form'],
}

export const documentType = (id: DocumentTypeId) => DOCUMENT_TYPES.find((t) => t.id === id)!

// Phrases that only appear on one kind of document count extra, so UEDI's own form (which
// mentions salary and net pay) isn't mistaken for a payslip.
const DECISIVE: Partial<Record<DocumentTypeId, RegExp>> = {
  application_form: /mutual\s+assistance|united\s+dnsc\s+employees/i,
  proof_of_address: /certificate\s+of\s+residency|bona\s*fide\s+resident|community\s+tax/i,
  payslip: /pay\s*slip|pay\s*period/i,
  valid_id: /pagkakakilanlan|philippine\s+identification|driver'?s?\s+licen[cs]e|passport/i,
}

/** Picks the type whose keywords match the text most. */
/** Other types a slot accepts without a warning: a DNSC ID is a valid ID too. */
export const ACCEPTED_AS: Partial<Record<DocumentTypeId, DocumentTypeId[]>> = {
  valid_id: ['employee_id'],
  employee_id: ['valid_id'],
}

export function detectDocumentType(text: string): { id: DocumentTypeId; score: number } {
  let best: { id: DocumentTypeId; score: number } = { id: 'other', score: 0 }
  for (const t of DOCUMENT_TYPES) {
    const score = t.keywords.filter((k) => k.test(text)).length + (DECISIVE[t.id]?.test(text) ? 3 : 0)
    if (score > best.score) best = { id: t.id, score }
  }
  return best.score >= 2 ? best : { id: 'other', score: best.score }
}
