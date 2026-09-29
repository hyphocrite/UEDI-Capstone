import { documentType, detectDocumentType } from './documentTypes'
import type { CheckId, DocumentTypeId } from './documentTypes'
import {
  extractDateOfBirth,
  extractEmployer,
  extractExpiryDate,
  extractIdNumber,
  extractIncome,
  extractLatestDate,
  extractName,
  extractPaidAmount,
  namesMatch,
  textContainsName,
} from './extractors'

export type Applicant = {
  fullName: string
  dateOfBirth: string
  monthlyIncome: number
}

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type DocumentCheck = { id: CheckId; label: string; status: CheckStatus; detail: string }

export type DocumentVerdict = 'verified' | 'review' | 'mismatch' | 'unreadable'

export type DocumentAnalysis = {
  typeId: DocumentTypeId
  detectedTypeId: DocumentTypeId
  fields: {
    name: string | null
    dateOfBirth: string | null
    income: number | null
    amount: number | null
    documentDate: string | null
    expiryDate: string | null
    employer: string | null
    idNumber: string | null
  }
  checks: DocumentCheck[]
  verdict: DocumentVerdict
}

/** Income tolerance from Chainscore: ±5% or ±₱500, whichever is larger. */
export const incomeTolerance = (declared: number) => Math.max(500, declared * 0.05)

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
const daysBetween = (a: string, b: Date) => Math.floor((b.getTime() - new Date(a).getTime()) / 86_400_000)

export function analyzeDocument(
  text: string,
  applicant: Applicant,
  opts: { typeId?: DocumentTypeId; confidence?: number; today?: Date } = {},
): DocumentAnalysis {
  const today = opts.today ?? new Date()
  const detected = detectDocumentType(text)
  const typeId = opts.typeId ?? detected.id
  const type = documentType(typeId)

  const fields = {
    name: extractName(text),
    dateOfBirth: extractDateOfBirth(text),
    income: extractIncome(text),
    amount: extractPaidAmount(text),
    documentDate: extractLatestDate(text, today),
    expiryDate: extractExpiryDate(text),
    employer: extractEmployer(text),
    idNumber: extractIdNumber(text),
  }

  const readable = text.replace(/\s/g, '').length >= 20
  if (!readable) {
    return {
      typeId,
      detectedTypeId: detected.id,
      fields,
      checks: [],
      verdict: 'unreadable',
    }
  }

  const checks: DocumentCheck[] = []
  for (const id of type.checks) {
    switch (id) {
      case 'name': {
        const declared = applicant.fullName.trim()
        if (!declared) {
          checks.push({ id, label: 'Name', status: 'warn', detail: 'Enter the applicant’s name to compare.' })
        } else if (textContainsName(text, declared) || (fields.name && namesMatch(declared, fields.name))) {
          checks.push({ id, label: 'Name', status: 'pass', detail: `Matches ${declared}.` })
        } else {
          checks.push({
            id,
            label: 'Name',
            status: 'fail',
            detail: fields.name ? `Document shows “${fields.name}”, not ${declared}.` : `Could not find ${declared} on the document.`,
          })
        }
        break
      }
      case 'dateOfBirth': {
        if (!fields.dateOfBirth) {
          checks.push({ id, label: 'Date of birth', status: 'warn', detail: 'No date of birth found. Check it by eye.' })
        } else if (!applicant.dateOfBirth) {
          checks.push({ id, label: 'Date of birth', status: 'warn', detail: `Document shows ${fields.dateOfBirth}. Enter the applicant’s birth date to compare.` })
        } else if (fields.dateOfBirth === applicant.dateOfBirth) {
          checks.push({ id, label: 'Date of birth', status: 'pass', detail: `Matches ${fields.dateOfBirth}.` })
        } else {
          checks.push({ id, label: 'Date of birth', status: 'fail', detail: `Document shows ${fields.dateOfBirth}, application says ${applicant.dateOfBirth}.` })
        }
        break
      }
      case 'income': {
        const declared = applicant.monthlyIncome
        if (fields.income === null) {
          checks.push({ id, label: 'Income', status: 'warn', detail: 'No income amount found. Check it by eye.' })
        } else if (!declared) {
          checks.push({ id, label: 'Income', status: 'warn', detail: `Document shows ${peso(fields.income)}. Enter the declared income to compare.` })
        } else if (Math.abs(fields.income - declared) <= incomeTolerance(declared)) {
          checks.push({ id, label: 'Income', status: 'pass', detail: `${peso(fields.income)} is within 5% of the declared ${peso(declared)}.` })
        } else {
          checks.push({ id, label: 'Income', status: 'fail', detail: `Document shows ${peso(fields.income)}, declared income is ${peso(declared)}.` })
        }
        break
      }
      case 'amount':
        checks.push(
          fields.amount === null
            ? { id, label: 'Amount', status: 'warn', detail: 'No amount found. Check it by eye.' }
            : { id, label: 'Amount', status: 'pass', detail: `${peso(fields.amount)} found.` },
        )
        break
      case 'recent': {
        const max = type.maxAgeDays ?? 90
        if (!fields.documentDate) {
          checks.push({ id, label: 'Date', status: 'warn', detail: 'No date found. Check the document is recent.' })
        } else {
          const age = daysBetween(fields.documentDate, today)
          checks.push(
            age <= max
              ? { id, label: 'Date', status: 'pass', detail: `Dated ${fields.documentDate} (${age} days ago).` }
              : { id, label: 'Date', status: 'fail', detail: `Dated ${fields.documentDate}, older than ${max} days.` },
          )
        }
        break
      }
      case 'notExpired': {
        if (!fields.expiryDate) {
          checks.push({ id, label: 'Expiry', status: 'warn', detail: 'No expiry date found. Check the ID is still valid.' })
        } else {
          const expired = fields.expiryDate < today.toISOString().slice(0, 10)
          checks.push(
            expired
              ? { id, label: 'Expiry', status: 'fail', detail: `Expired on ${fields.expiryDate}.` }
              : { id, label: 'Expiry', status: 'pass', detail: `Valid until ${fields.expiryDate}.` },
          )
        }
        break
      }
      case 'employer':
        checks.push(
          fields.employer
            ? { id, label: 'Employer', status: 'pass', detail: fields.employer }
            : { id, label: 'Employer', status: 'warn', detail: 'No employer found. Check it by eye.' },
        )
        break
      case 'idNumber':
        checks.push(
          fields.idNumber
            ? { id, label: 'ID number', status: 'pass', detail: fields.idNumber }
            : { id, label: 'ID number', status: 'warn', detail: 'No ID number found.' },
        )
        break
    }
  }

  if (opts.confidence !== undefined && opts.confidence < 60) {
    checks.push({
      id: 'name',
      label: 'Scan quality',
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
