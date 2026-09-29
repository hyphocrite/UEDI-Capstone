// Field extractors for OCR text. Name and income extraction are ported from Chainscore
// (src/lib/ocrName.ts, src/lib/ocrIncome.ts); dates, employer and ID numbers are new.

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

export function normalizeName(name: string) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the names share enough words, in any order (handles "SURNAME, GIVEN" layouts). */
export function namesMatch(declared: string, found: string): boolean {
  const a = normalizeName(declared)
  const b = normalizeName(found)
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const ta = a.split(' ').filter((t) => t.length > 1)
  const tb = b.split(' ').filter((t) => t.length > 1)
  if (!ta.length || !tb.length) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const hits = short.filter((t) => long.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))
  return hits.length >= Math.min(short.length, 2)
}

/** True when the declared name appears anywhere in the document text. */
export function textContainsName(text: string, declared: string): boolean {
  const hay = normalizeName(text)
  const words = normalizeName(declared).split(' ').filter((w) => w.length > 1)
  if (words.length === 0) return false
  const found = words.filter((w) => new RegExp(`\\b${w}\\b`).test(hay))
  return found.length >= Math.min(words.length, 2)
}

// ---- Amounts ---------------------------------------------------------------

const AMOUNT = /(?:₱|PHP|Php|php|P)?\s*(\d{1,3}(?:[,\s]\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}|\d{3,})/g

function parseAmount(raw: string) {
  const n = Number(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Best income figure (net pay, salary, monthly income) in the text. From Chainscore. */
export function extractIncome(text: string): number | null {
  const label = /(net\s*pay|netpay|take[-\s]*home|monthly\s*(?:income|salary|pay)|basic\s*(?:pay|salary)|salary|gross\s*pay|income|compensation)/i
  let best: number | null = null
  let bestScore = -1
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(AMOUNT)) {
      const n = parseAmount(m[1])
      if (n === null || n < 100 || (n >= 1900 && n <= 2100 && !/[.,]/.test(m[1]))) continue
      let score = 1
      if (label.test(line)) score += 10
      if (/net\s*pay|take[-\s]*home/i.test(line)) score += 4
      if (/monthly/i.test(line)) score += 2
      if (/deduction|tax|sss|philhealth|pag-?ibig|loan/i.test(line)) score -= 6
      if (score > bestScore) {
        bestScore = score
        best = n
      }
    }
  }
  return bestScore >= 5 ? best : null
}

/** Amount paid on a receipt or deposit slip. */
export function extractPaidAmount(text: string): number | null {
  const label = /(amount\s*(?:paid|due|received)?|total|cash|deposit|payment|php|₱)/i
  let best: number | null = null
  let bestScore = -1
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(AMOUNT)) {
      const n = parseAmount(m[1])
      if (n === null || n < 1) continue
      let score = 1
      if (label.test(line)) score += 5
      if (/total|amount\s*paid/i.test(line)) score += 3
      if (/receipt\s*no|ref|account|tin|or\s*no/i.test(line)) score -= 8
      if (score > bestScore) {
        bestScore = score
        best = n
      }
    }
  }
  return bestScore >= 5 ? best : null
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

export function extractDateOfBirth(text: string): string | null {
  const lines = text.split(/\r?\n/)
  const label = /(date\s*of\s*birth|birth\s*date|birthday|\bdob\b|petsa\s*ng\s*kapanganakan|born\s*on)/i
  for (let i = 0; i < lines.length; i++) {
    if (!label.test(lines[i])) continue
    const found = findDates(lines[i]).concat(findDates(lines[i + 1] ?? ''))
    if (found.length) return found[0]
  }
  return null
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

export function extractEmployer(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:employer|company|agency)\s*(?:name)?\s*[:-]\s*(.+)/i)
    if (m && m[1].length > 2) return m[1].trim()
  }
  const corp = lines.find((l) => /\b(inc\.?|corp(?:oration)?\.?|co\.|company|enterprises?|school|university|hospital|government)\b/i.test(l) && l.length < 80)
  return corp ?? null
}

export function extractIdNumber(text: string): string | null {
  const m =
    text.match(/\b(?:id|license|crn|sss?|umid|psn|pcn|passport|tin)\b\.?\s*(?:no\.?|number|#)?\s*[:-]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{6,})/i) ??
    text.match(/\b(\d{4}-\d{4}-\d{4}(?:-\d{4})?|\d{2}-\d{7}-\d|[A-Z]\d{2}-\d{2}-\d{6})\b/)
  return m ? m[1] : null
}
