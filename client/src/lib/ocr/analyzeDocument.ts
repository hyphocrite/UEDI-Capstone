import { documentType, detectDocumentType } from './documentTypes'
import type { CheckId, DocumentTypeId } from './documentTypes'
import { extractExpiryDate, extractIdNumber, extractLatestDate, extractName, extractPayslip } from './extractors'
import { formatDeclaredName, matchAddress, matchEmployer, matchName, withinTolerance } from './matching'
import type { Tolerance } from './matching'
import { OCR_SETTINGS } from './ocrSettings'

/** What the applicant wrote on the Mutual Assistance form. */
export type Applicant = {
  lastName: string
  firstName: string
  middleInitial?: string
  residenceAddress: string
  employer: string
  monthlySalary: number
  netTakeHomePay: number
}

/** 'info' is shown to the officer but never changes the verdict. */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'

export type DocumentCheck = { id: CheckId | 'quality'; label: string; status: CheckStatus; detail: string }

export type DocumentVerdict = 'verified' | 'review' | 'mismatch' | 'unreadable'

export type DocumentAnalysis = {
  typeId: DocumentTypeId
  detectedTypeId: DocumentTypeId
  fields: {
    name: string | null
    basicSalary: number | null
    grossPay: number | null
    netPay: number | null
    semiMonthly: boolean
    documentDate: string | null
    expiryDate: string | null
    idNumber: string | null
  }
  checks: DocumentCheck[]
  verdict: DocumentVerdict
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
const daysBetween = (a: string, b: Date) => Math.floor((b.getTime() - new Date(a).getTime()) / 86_400_000)

type AmountCheck = { status: CheckStatus; detail: string }

/**
 * Compares a declared monthly amount with what the document shows. Semi-monthly payslips
 * show half a month, so the doubled amount counts too.
 */
function compareMonthly(found: number | null, declared: number, semiMonthly: boolean, what: string, t: Tolerance): AmountCheck {
  if (found === null) return { status: 'warn', detail: `No ${what} found. Check it by eye.` }
  if (!declared) return { status: 'warn', detail: `Document shows ${peso(found)}. Enter the ${what} to compare.` }
  if (withinTolerance(found, declared, t)) return { status: 'pass', detail: `${peso(found)} matches the declared ${peso(declared)}.` }
  if (semiMonthly && withinTolerance(found * 2, declared, t)) {
    return { status: 'pass', detail: `${peso(found)} per quincena, ${peso(found * 2)} a month, matches the declared ${peso(declared)}.` }
  }
  const monthly = semiMonthly ? ` (${peso(found * 2)} a month)` : ''
  return { status: 'fail', detail: `Document shows ${peso(found)}${monthly}; the form says ${peso(declared)}.` }
}

export function analyzeDocument(
  text: string,
  applicant: Applicant,
  opts: { typeId?: DocumentTypeId; confidence?: number; today?: Date } = {},
): DocumentAnalysis {
  const today = opts.today ?? new Date()
  const detected = detectDocumentType(text)
  const typeId = opts.typeId ?? detected.id
  const type = documentType(typeId)
  const pay = extractPayslip(text)

  const fields: DocumentAnalysis['fields'] = {
    name: extractName(text),
    basicSalary: pay.basic,
    grossPay: pay.gross,
    netPay: pay.net,
    semiMonthly: pay.semiMonthly,
    documentDate: extractLatestDate(text, today),
    expiryDate: extractExpiryDate(text),
    idNumber: extractIdNumber(text),
  }

  if (text.replace(/\s/g, '').length < 20) {
    return { typeId, detectedTypeId: detected.id, fields, checks: [], verdict: 'unreadable' }
  }

  const checks: DocumentCheck[] = []
  const add = (id: DocumentCheck['id'], label: string, r: { status: CheckStatus; detail: string }) =>
    checks.push({ id, label, status: r.status, detail: r.detail })

  for (const id of type.checks) {
    switch (id) {
      case 'name': {
        const r = matchName(text, applicant)
        // Handwriting on the signed form often doesn't OCR; that alone isn't a mismatch.
        add(id, 'Name', typeId === 'application_form' && r.status === 'fail'
          ? { status: 'warn', detail: `Couldn't read ${formatDeclaredName(applicant)} from the form. Check it by eye.` }
          : r)
        break
      }
      case 'address': {
        const r = matchAddress(text, applicant.residenceAddress)
        // IDs don't always print an address, so on an ID a miss is a note, not a failure.
        add(id, 'Address', typeId === 'proof_of_address' || r.status === 'pass' ? r : { status: 'info', detail: 'Address not checked on this ID.' })
        break
      }
      case 'employer':
        add(id, 'Employer', matchEmployer(text, applicant.employer))
        break
      case 'salary': {
        // The form's "Monthly Salary" is the basic salary; gross adds allowances like PERA.
        const basic = compareMonthly(pay.basic, applicant.monthlySalary, false, 'basic salary', OCR_SETTINGS.salaryTolerance)
        const gross = compareMonthly(pay.gross, applicant.monthlySalary, pay.semiMonthly, 'gross pay', OCR_SETTINGS.salaryTolerance)
        const r = basic.status === 'pass' ? basic : gross.status === 'pass' ? { ...gross, detail: `Gross pay: ${gross.detail}` } : pay.basic !== null ? basic : gross
        add(id, 'Monthly salary', typeId === 'certificate_of_employment' && pay.basic === null && pay.gross === null
          ? { status: 'info', detail: 'No salary shown on this certificate.' }
          : r)
        break
      }
      case 'netPay':
        add(id, 'Net take-home pay', compareMonthly(pay.net, applicant.netTakeHomePay, pay.semiMonthly, 'net pay', OCR_SETTINGS.netPayTolerance))
        break
      case 'recent': {
        const max = type.maxAgeDays ?? 90
        if (!fields.documentDate) {
          add(id, 'Date', { status: 'warn', detail: 'No date found. Check the document is recent.' })
        } else {
          const age = daysBetween(fields.documentDate, today)
          add(id, 'Date', age <= max
            ? { status: 'pass', detail: `Dated ${fields.documentDate} (${age} days ago).` }
            : { status: 'fail', detail: `Dated ${fields.documentDate}, older than ${max} days.` })
        }
        break
      }
      case 'notExpired':
        if (!fields.expiryDate) {
          // PhilSys national IDs have no expiry date.
          add(id, 'Expiry', { status: 'info', detail: 'No expiry date found. Fine for a national ID; check other IDs by eye.' })
        } else {
          add(id, 'Expiry', fields.expiryDate < today.toISOString().slice(0, 10)
            ? { status: 'fail', detail: `Expired on ${fields.expiryDate}.` }
            : { status: 'pass', detail: `Valid until ${fields.expiryDate}.` })
        }
        break
      case 'idNumber':
        add(id, 'ID number', fields.idNumber ? { status: 'info', detail: fields.idNumber } : { status: 'info', detail: 'No ID number found.' })
        break
      case 'signature':
        add(id, 'Signature', { status: 'warn', detail: 'Check by eye that the form is signed.' })
        break
    }
  }

  if (opts.confidence !== undefined && opts.confidence < 60) {
    checks.push({
      id: 'quality',
      label: 'Photo quality',
      status: 'warn',
      detail: `Low OCR confidence (${Math.round(opts.confidence)}%). Ask for a clearer photo if values look wrong.`,
    })
  }

  const verdict: DocumentVerdict = checks.some((c) => c.status === 'fail')
    ? 'mismatch'
    : checks.some((c) => c.status === 'warn')
      ? 'review'
      : 'verified'

  return { typeId, detectedTypeId: detected.id, fields, checks, verdict }
}
