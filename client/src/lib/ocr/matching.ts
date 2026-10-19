// Fuzzy matching between what the applicant typed on the form and what OCR read from a
// document. OCR on phone photos misreads characters (O/0, I/1, S/5, rn/m), drops spaces
// and splits names across lines, so exact string comparison fails on genuine documents.

export type MatchStatus = 'pass' | 'warn' | 'fail'
export type MatchResult = { status: MatchStatus; score: number; detail: string }

export function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Uppercase letters and digits only, single-spaced. Ñ becomes N. */
export function normalize(s: string) {
  return stripAccents(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

// Digits OCR puts inside words, and letters it puts inside numbers.
const LETTER_FOR_DIGIT: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G', '4': 'A', '|': 'I', '$': 'S' }
const DIGIT_FOR_LETTER: Record<string, string> = { O: '0', o: '0', Q: '0', D: '0', l: '1', I: '1', i: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', z: '2' }

/** In tokens that are mostly letters, turn stray digits back into letters ("SANT0S" -> "SANTOS"). */
export function fixLetters(token: string) {
  const letters = token.replace(/[^A-Za-z]/g, '').length
  if (letters < token.length / 2) return token
  return token.replace(/[0-9|$]/g, (c) => LETTER_FOR_DIGIT[c] ?? c)
}

/**
 * In number-like tokens, turn look-alike letters back into digits ("1O,5OO.OO" -> "10,500.00").
 * Only tokens made of digits, separators and look-alike letters, with at least one real digit.
 */
export function fixDigits(token: string) {
  const m = token.match(/^(₱|PHP|Php|P)?([\dOoQDlIi|SsBZz.,]+)$/)
  if (!m || !/\d/.test(m[2])) return token
  return (m[1] ?? '') + m[2].replace(/[A-Za-z|]/g, (c) => DIGIT_FOR_LETTER[c] ?? c)
}

export function words(text: string) {
  return normalize(text.split(/\s+/).map(fixLetters).join(' ')).split(' ').filter(Boolean)
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** 1 for identical, 0 for nothing in common. */
export function similarity(a: string, b: string) {
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

/** Short words must match exactly; longer ones may have about one OCR error per five letters. */
export function tokenThreshold(token: string) {
  return token.length <= 3 ? 1 : token.length <= 5 ? 0.79 : 0.8
}

/**
 * Best place a (possibly multi-word) phrase appears in the document's words.
 * Also tries the phrase with its spaces removed against one or two joined words, because
 * OCR often merges or splits names like "DELA CRUZ" / "DELACRUZ".
 */
export function findPhrase(phrase: string[], hay: string[]): { score: number; index: number } {
  if (!phrase.length || !hay.length) return { score: 0, index: -1 }
  let best = { score: 0, index: -1 }
  const joined = phrase.join('')
  for (let i = 0; i < hay.length; i++) {
    let total = 0
    for (let k = 0; k < phrase.length; k++) {
      const w = hay[i + k]
      const s = w ? similarity(phrase[k], w) : 0
      total += s >= tokenThreshold(phrase[k]) ? s : 0
    }
    const seq = total / phrase.length
    const one = similarity(joined, hay[i])
    const two = hay[i + 1] ? similarity(joined, hay[i] + hay[i + 1]) : 0
    const merged = Math.max(one, two) >= tokenThreshold(joined) ? Math.max(one, two) : 0
    const score = Math.max(seq, merged)
    if (score > best.score) best = { score, index: i }
  }
  return best
}

export type DeclaredName = { lastName: string; firstName: string; middleInitial?: string }

export const formatDeclaredName = (n: DeclaredName) =>
  [n.firstName, n.middleInitial ? `${n.middleInitial.replace(/\.$/, '')}.` : '', n.lastName].filter(Boolean).join(' ')

/**
 * The applicant's last and first name must both appear, close together (IDs often put
 * them on separate lines: "SANTOS" / "MARIA CLARA").
 */
export function matchName(text: string, name: DeclaredName): MatchResult {
  const hay = words(text)
  const last = words(name.lastName)
  const first = words(name.firstName)
  const label = formatDeclaredName(name)
  if (!last.length || !first.length) return { status: 'warn', score: 0, detail: 'Enter the last and first name to compare.' }

  const l = findPhrase(last, hay)
  // Only the first given name has to match; "MARIA CLARA" may appear as "MA. CLARA".
  const full = findPhrase(first, hay)
  const firstWord = findPhrase(first.slice(0, 1), hay)
  const f = full.score >= firstWord.score ? full : firstWord
  const near = l.index >= 0 && f.index >= 0 && Math.abs(l.index - f.index) <= 8
  const score = Math.min(l.score, f.score)

  if (l.score >= 0.85 && f.score >= 0.85 && near) return { status: 'pass', score, detail: `Matches ${label}.` }
  if (l.score >= 0.75 && f.score >= 0.75) {
    return { status: 'warn', score, detail: `Close to ${label}, but not exact${near ? '' : ' or not together'}. Check it by eye.` }
  }
  if (l.score >= 0.85 && f.score < 0.75) return { status: 'fail', score, detail: `Found the last name ${name.lastName}, but not ${name.firstName}.` }
  return { status: 'fail', score, detail: `Could not find ${label} on the document.` }
}

// ---- Addresses --------------------------------------------------------------

const ADDRESS_SYNONYMS: [RegExp, string][] = [
  [/\b(?:BRGY|BGY|BRG|BARANGAY|BRY)\b/g, 'BARANGAY'],
  [/\b(?:PRK|PUROK)\b/g, 'PUROK'],
  [/\bSTO\b/g, 'SANTO'],
  [/\bSTA\b/g, 'SANTA'],
  [/\bSAN\b/g, 'SAN'],
  [/\bPOB\b/g, 'POBLACION'],
  [/\bDDN\b/g, 'DAVAO DEL NORTE'],
]
// Words that appear in almost every local address and prove nothing on their own.
const ADDRESS_FILLER = new Set(['BARANGAY', 'PUROK', 'CITY', 'OF', 'THE', 'PROVINCE', 'PHILIPPINES', 'STREET', 'ST', 'ZONE', 'SITIO', 'BLK', 'LOT', 'PHASE', 'DEL', 'NORTE', 'DAVAO', 'REGION', 'XI'])

function addressWords(text: string) {
  let s = ` ${normalize(text.split(/\s+/).map(fixLetters).join(' '))} `
  for (const [re, to] of ADDRESS_SYNONYMS) s = s.replace(re, to)
  return s.trim().split(' ').filter(Boolean)
}

/** Share of the declared address's distinctive words found on the document. */
export function matchAddress(text: string, declared: string): MatchResult {
  const want = addressWords(declared).filter((w) => !ADDRESS_FILLER.has(w))
  if (!want.length) return { status: 'warn', score: 0, detail: 'Enter the residence address to compare.' }
  const hay = addressWords(text)
  const found = want.filter((w) => (/^\d+$/.test(w) ? hay.includes(w) : hay.some((h) => similarity(w, h) >= tokenThreshold(w))))
  const score = found.length / want.length
  const missing = want.filter((w) => !found.includes(w))
  if (score >= 0.7) return { status: 'pass', score, detail: `Address matches (${found.length} of ${want.length} parts found).` }
  if (score >= 0.4) return { status: 'warn', score, detail: `Address partly matches. Not found: ${missing.join(', ')}.` }
  return { status: 'fail', score, detail: `Address on the document doesn't match. Not found: ${missing.join(', ')}.` }
}

// ---- Employer ---------------------------------------------------------------

// Short and long forms of the same employer. DNSC is UEDI's own institution.
const EMPLOYER_ALIASES: string[][] = [['DNSC', 'DAVAO DEL NORTE STATE COLLEGE']]

export function matchEmployer(text: string, declared: string): MatchResult {
  const target = normalize(declared)
  if (!target) return { status: 'warn', score: 0, detail: 'Enter the employer to compare.' }
  const forms = EMPLOYER_ALIASES.find((group) => group.some((g) => target.includes(g))) ?? [target]
  const hay = words(text)
  const ignore = new Set(['OF', 'THE', 'AND', 'INC', 'CORP', 'CO'])
  let best = 0
  for (const form of forms) {
    const parts = form.split(' ').filter((w) => !ignore.has(w))
    best = Math.max(best, findPhrase(parts, hay).score)
  }
  if (best >= 0.85) return { status: 'pass', score: best, detail: `Shows ${declared}.` }
  if (best >= 0.7) return { status: 'warn', score: best, detail: `Employer looks like ${declared}, but the text is unclear.` }
  return { status: 'fail', score: best, detail: `Could not find ${declared} on the document.` }
}

// ---- Amounts ----------------------------------------------------------------

export type Tolerance = { percent: number; minimum: number }

export const withinTolerance = (found: number, declared: number, t: Tolerance) =>
  Math.abs(found - declared) <= Math.max(t.minimum, (declared * t.percent) / 100)
