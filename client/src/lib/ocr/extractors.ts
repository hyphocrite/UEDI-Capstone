// Field extractors for OCR text. Name extraction is ported from Chainscore
// (src/lib/ocrName.ts); dates, ID numbers and the payslip reader (basic salary, gross,
// net pay, pay period) were written for UEDI. Matching against the form is in matching.ts.

import { fixDigits } from './matching'

const NAME_LABEL =
  /(?:full\s*name|name\s+of\s+(?:child|employee|payee|account\s*holder)|employee\s*name|given\s*names?|first\s*name|last\s*name|surname|middle\s*name|received\s+from|payee|account\s*name|pangalan|apelyido|\bnames?\b)\s*[:–-]?\s*/i

// Lines about other people on the document (parents, spouse, informant) are skipped.
const OTHER_PERSON = /(mother|father|maiden|spouse|husband|wife|informant|witness|attendant|signature|prepared\s+by|approved\s+by)/i

const NOT_A_NAME =
  /(republic|philippines|certificate|statistics|authority|department|office|bureau|registry|registrar|license|identification|payslip|statement|receipt|company|corporation|inc\b|bank|address|province|city|municipality|salary|monthly|income|amount|php|date|place|position|period|employed|trading)/i

function cleanName(raw: string) {
  return raw.replace(/[^A-Za-zÑñ\s,.-]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim()
}

function scoreNameLine(line: string): number {
  const cleaned = cleanName(line)
  if (cleaned.length < 4 || /\d{4,}/.test(line) || NOT_A_NAME.test(cleaned)) return 0
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 6) return 0
  const letterRatio = cleaned.replace(/[^A-Za-zÑñ\s]/g, '').length / cleaned.length
  if (letterRatio < 0.7) return 0
  return words.length * 2 + Math.min(cleaned.length, 30)
}

/** Value after a label on the same line, or the next line when the label stands alone. */
function valueAfter(lines: string[], i: number, label: RegExp) {
  const after = lines[i].replace(label, '').trim()
  return after.length >= 2 ? after : (lines[i + 1] ?? '')
}

export function extractName(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // IDs often split the name: "Last Name: SANTOS" and "Given Names: MARIA CLARA".
  const lastIdx = lines.findIndex((l) => /^(?:last\s*name|surname|apelyido)\b/i.test(l))
  const givenIdx = lines.findIndex((l) => /^(?:given\s*names?|first\s*name|mga\s*pangalan)\b/i.test(l))
  if (lastIdx >= 0 && givenIdx >= 0) {
    const last = cleanName(valueAfter(lines, lastIdx, /^(?:last\s*name|surname|apelyido)\s*[:–-]?\s*/i))
    const given = cleanName(valueAfter(lines, givenIdx, /^(?:given\s*names?|first\s*name|mga\s*pangalan)\s*[:–-]?\s*/i))
    if (last && given) return `${given} ${last}`
  }

  let best: string | null = null
  let bestScore = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (OTHER_PERSON.test(line)) continue
    if (NAME_LABEL.test(line)) {
      const candidate = valueAfter(lines, i, NAME_LABEL)
      const score = scoreNameLine(candidate) + 20
      if (score > 20 && score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    const score = scoreNameLine(line)
    if (score > bestScore && score >= 4) {
      bestScore = score
      best = line
    }
  }
  return best ? cleanName(best) : null
}

// ---- Amounts ---------------------------------------------------------------

const AMOUNT = /(?:₱|PHP|Php|php|P)?\s*(\d{1,3}(?:[, ]\d{3})+(?:\.\d{1,2})?(?![\d,])|\d+\.\d{2}(?!\d)|\d{3,}(?:\.\d{1,2})?(?!\d))/g

function parseAmount(raw: string) {
  let t = raw.replace(/[^\d.,]/g, '')
  // "12.345,67" (rare) -> "12345.67"; otherwise commas are thousands separators.
  if (/\.\d{3},\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  t = t.replace(/,/g, '')
  // Keep only the last dot as the decimal point ("12.345.00" from OCR -> "12345.00").
  const parts = t.split('.')
  if (parts.length > 2) t = parts.slice(0, -1).join('') + '.' + parts.at(-1)
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Fixes letters OCR put inside numbers ("1O,5OO.OO" -> "10,500.00") before reading amounts. */
export function fixNumbers(line: string) {
  return line.split(/(\s+)/).map((t) => (/\s/.test(t) ? t : fixDigits(t))).join('')
}

/** Peso amounts on a line, ignoring years, dates and small counts. */
export function amountsIn(line: string): number[] {
  const out: number[] = []
  const clean = fixNumbers(line).replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
  for (const m of clean.matchAll(AMOUNT)) {
    const n = parseAmount(m[1])
    if (n === null || n < 100) continue
    if (n >= 1900 && n <= 2100 && !/[.,]/.test(m[1])) continue
    out.push(n)
  }
  return out
}

export type PayslipAmounts = {
  basic: number | null
  gross: number | null
  net: number | null
  /** True when the payslip covers half a month (quincena / semi-monthly payroll). */
  semiMonthly: boolean
}

const NET_LABEL = /\bnet\b|take[\s-]*home/i
const BASIC_LABEL = /basic\s*(?:monthly\s*)?(?:salary|pay)|monthly\s*(?:basic\s*)?(?:salary|rate|pay|compensation)|salary\s*rate|rate\s*per\s*month/i
const GROSS_LABEL = /\bgross\b|total\s*(?:earnings|compensation|income)/i
const NOT_PAY = /deduction|tax|gsis|sss|philhealth|pag-?ibig|hdmf|loan|premium|contribution|balance/i

/**
 * Reads basic salary, gross and net pay from a payslip. Handles values on the label's
 * line, on the next line, and table layouts where a row of labels sits over a row of values.
 */
export function extractPayslip(text: string): PayslipAmounts {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const found: Record<'basic' | 'gross' | 'net', number | null> = { basic: null, gross: null, net: null }
  const set = (k: keyof typeof found, v: number | undefined) => {
    if (v !== undefined && found[k] === null) found[k] = v
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const labels: (keyof typeof found)[] = []
    // Order labels by where they appear, for the table layout below.
    const hits = [
      { k: 'basic' as const, at: line.search(BASIC_LABEL) },
      { k: 'gross' as const, at: line.search(GROSS_LABEL) },
      { k: 'net' as const, at: line.search(NET_LABEL) },
    ].filter((h) => h.at >= 0).sort((a, b) => a.at - b.at)
    for (const h of hits) labels.push(h.k)
    if (!labels.length) continue

    const here = amountsIn(line)
    // Table header: cells separated by wide gaps, values in the same order on the next line.
    const cells = line.split(/\s{2,}|\t/).filter(Boolean)
    const below = amountsIn(lines[i + 1] ?? '')
    if (cells.length >= 2 && here.length === 0 && below.length === cells.length) {
      cells.forEach((cell, j) => {
        if (NET_LABEL.test(cell)) set('net', below[j])
        else if (BASIC_LABEL.test(cell)) set('basic', below[j])
        else if (GROSS_LABEL.test(cell)) set('gross', below[j])
      })
      continue
    }
    if (labels.length === 1) {
      const k = labels[0]
      if (k !== 'net' && NOT_PAY.test(line)) continue
      set(k, here[0] ?? amountsIn(lines[i + 1] ?? '')[0])
    } else {
      const values = here.length >= labels.length ? here : amountsIn(lines[i + 1] ?? '')
      if (values.length >= labels.length) labels.forEach((k, j) => set(k, values[j]))
      else if (here.length === 1) set(labels[labels.length - 1], here[0])
    }
  }

  const semiMonthly =
    /quincena|semi[-\s]?monthly|(?:1st|2nd|first|second)\s*half|\b(?:1|01|16)\s*[-–]\s*(?:15|28|29|30|31)\b/i.test(text)
  return { ...found, semiMonthly }
}

// ---- Dates -----------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function toIso(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null
  return date.toISOString().slice(0, 10)
}

const monthIndex = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1

/** Finds every date in a line, in the formats Philippine documents commonly use. */
export function findDates(line: string): string[] {
  const out: string[] = []
  const add = (iso: string | null) => iso && out.push(iso)
  // Certificates: "Issued this 10th day of October, 2026"
  for (const m of line.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+day\s+of\s+([A-Za-z]{3,9}),?\s+(\d{4})\b/gi))
    if (monthIndex(m[2]) > 0) add(toIso(+m[3], monthIndex(m[2]), +m[1]))
  // Pay periods: "October 1-15, 2026" / "Oct. 16 - 31 2026" -> the end date
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})\b/g))
    if (monthIndex(m[1]) > 0) add(toIso(+m[4], monthIndex(m[1]), Math.min(+m[3], 31)) ?? toIso(+m[4], monthIndex(m[1]), 28))
  // January 5, 1990 / Jan. 05 1990
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g))
    if (monthIndex(m[1]) > 0) add(toIso(+m[3], monthIndex(m[1]), +m[2]))
  // 05 January 1990 / 5-JAN-1990
  for (const m of line.matchAll(/\b(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{4})\b/g))
    if (monthIndex(m[2]) > 0) add(toIso(+m[3], monthIndex(m[2]), +m[1]))
  // 1990-01-05 / 1990/01/05
  for (const m of line.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) add(toIso(+m[1], +m[2], +m[3]))
  // 01/05/1990 (month first, the Philippine default)
  for (const m of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g))
    add(toIso(+m[3], +m[1], +m[2]) ?? toIso(+m[3], +m[2], +m[1]))
  return out
}

export function extractExpiryDate(text: string): string | null {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!/(expir|valid\s*until|valid\s*thru|validity)/i.test(lines[i])) continue
    const found = findDates(lines[i]).concat(findDates(lines[i + 1] ?? ''))
    if (found.length) return found[0]
  }
  return null
}

/** The latest date on the document, which is usually the issue, billing or pay date. */
export function extractLatestDate(text: string, today = new Date()): string | null {
  const limit = today.toISOString().slice(0, 10)
  const all = text.split(/\r?\n/).flatMap(findDates).filter((d) => d <= limit)
  return all.sort().at(-1) ?? null
}

export function extractIdNumber(text: string): string | null {
  const m =
    text.match(/\b(?:id|license|crn|sss?|umid|psn|pcn|passport|tin)\b\.?\s*(?:no\.?|number|#)?\s*[:-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{6,})/i) ??
    text.match(/\b(\d{4}-\d{4}-\d{4}(?:-\d{4})?|\d{2}-\d{7}-\d|[A-Z]\d{2}-\d{2}-\d{6})\b/)
  return m ? m[1] : null
}
