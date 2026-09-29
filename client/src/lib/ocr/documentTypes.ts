// The supporting documents UEDI can receive with a loan application.
// To add a type, add an entry here: detection keywords and which checks to run.

export type DocumentTypeId =
  | 'valid_id'
  | 'birth_certificate'
  | 'payslip'
  | 'payment_receipt'
  | 'certificate_of_employment'
  | 'proof_of_billing'
  | 'bank_statement'
  | 'marriage_certificate'
  | 'other'

export type CheckId = 'name' | 'dateOfBirth' | 'income' | 'amount' | 'recent' | 'notExpired' | 'employer' | 'idNumber'

export type DocumentType = {
  id: DocumentTypeId
  label: string
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
    hint: 'PhilSys, UMID, driver’s license, passport, SSS, postal ID',
    keywords: [/republic\s+of\s+the\s+philippines/i, /driver'?s?\s+licen[cs]e/i, /\bumid\b/i, /philsys|philippine\s+identification|national\s+id/i, /passport/i, /social\s+security/i, /postal\s+id/i, /land\s+transportation/i, /\bid\s*no\b|identification\s+card/i],
    checks: ['name', 'dateOfBirth', 'notExpired', 'idNumber'],
  },
  {
    id: 'birth_certificate',
    label: 'Birth certificate',
    hint: 'PSA or local civil registrar copy',
    keywords: [/certificate\s+of\s+live\s+birth/i, /birth\s+certificate/i, /philippine\s+statistics\s+authority|\bpsa\b|\bnso\b/i, /civil\s+regist/i, /place\s+of\s+birth/i, /name\s+of\s+(?:child|father|mother)/i, /mother'?s\s+maiden/i],
    checks: ['name', 'dateOfBirth'],
  },
  {
    id: 'payslip',
    label: 'Payslip',
    hint: 'Latest payslip showing net pay',
    keywords: [/pay\s*slip/i, /net\s*pay/i, /gross\s*(?:pay|income|earnings)/i, /pay\s*period|payroll/i, /earnings/i, /deductions/i, /withholding\s+tax/i, /basic\s+(?:pay|salary)/i],
    checks: ['name', 'income', 'recent'],
    maxAgeDays: 90,
  },
  {
    id: 'payment_receipt',
    label: 'Payment slip or receipt',
    hint: 'Official receipt, deposit slip or proof of payment',
    keywords: [/official\s+receipt/i, /deposit\s+slip/i, /acknowledg(?:e)?ment\s+receipt/i, /amount\s+(?:paid|received)/i, /receipt\s+no/i, /transaction\s+(?:no|ref|date)/i, /reference\s+no/i, /gcash|maya|paymaya/i],
    checks: ['name', 'amount', 'recent'],
    maxAgeDays: 180,
  },
  {
    id: 'certificate_of_employment',
    label: 'Certificate of employment',
    hint: 'Signed by HR, with position and salary',
    keywords: [/certificate\s+of\s+employment/i, /this\s+is\s+to\s+certify/i, /(?:has\s+been|is\s+currently)\s+employed/i, /position|designation/i, /human\s+resources?/i],
    checks: ['name', 'employer', 'income', 'recent'],
    maxAgeDays: 180,
  },
  {
    id: 'proof_of_billing',
    label: 'Proof of billing',
    hint: 'Electric, water or internet bill',
    keywords: [/statement\s+of\s+account/i, /billing\s+(?:period|statement|date)/i, /due\s+date/i, /meralco|maynilad|manila\s+water|pldt|globe|converge/i, /\bkwh\b|cu\.?\s*m/i, /account\s+(?:no|number)/i],
    checks: ['name', 'recent'],
    maxAgeDays: 90,
  },
  {
    id: 'bank_statement',
    label: 'Bank statement',
    hint: 'Last 3 months',
    keywords: [/bank\s+statement|statement\s+of\s+account/i, /(?:opening|closing|ending|beginning)\s+balance/i, /withdrawals?/i, /deposits?/i, /\bbdo\b|\bbpi\b|metrobank|landbank|security\s+bank|pnb|unionbank/i],
    checks: ['name', 'recent'],
    maxAgeDays: 120,
  },
  {
    id: 'marriage_certificate',
    label: 'Marriage certificate',
    hint: 'For married applicants or spouse co-makers',
    keywords: [/certificate\s+of\s+marriage/i, /marriage\s+contract/i, /husband|wife/i, /solemniz/i],
    checks: ['name'],
  },
  {
    id: 'other',
    label: 'Other document',
    hint: 'Anything else the officer asked for',
    keywords: [],
    checks: ['name'],
  },
]

export const documentType = (id: DocumentTypeId) => DOCUMENT_TYPES.find((t) => t.id === id)!

/** Picks the type whose keywords match the text most. */
export function detectDocumentType(text: string): { id: DocumentTypeId; score: number } {
  let best: { id: DocumentTypeId; score: number } = { id: 'other', score: 0 }
  for (const t of DOCUMENT_TYPES) {
    const score = t.keywords.filter((k) => k.test(text)).length
    if (score > best.score) best = { id: t.id, score }
  }
  return best.score >= 2 ? best : { id: 'other', score: best.score }
}
