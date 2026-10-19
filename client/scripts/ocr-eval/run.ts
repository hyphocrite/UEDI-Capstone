// Measures how well the document checks work on a labeled set of real (or synthetic) photos,
// and compares OCR settings. This is how the OCR is "trained": collect labeled documents,
// run this, adjust settings or extractors, run again, keep what scores better.
//
//   npm run ocr:eval                                  # ocr-samples/ (every folder with labels.json)
//   npm run ocr:eval -- --dir ocr-samples/real --modes gray,binary --psm 3,4,6
//
// For each document it runs the checks twice:
//   genuine:  with what the applicant truly wrote (from labels.json). Checks should pass.
//   tampered: with one field changed (another name, salary +25%, ...). That check should fail.
// OCR results are cached in <dir>/.ocr-cache, so re-runs after changing extractors are fast.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { createWorker } from 'tesseract.js'
import { analyzeDocument } from '../../src/lib/ocr/analyzeDocument'
import type { Applicant, DocumentAnalysis } from '../../src/lib/ocr/analyzeDocument'
import type { DocumentTypeId } from '../../src/lib/ocr/documentTypes'
import { OCR_SETTINGS } from '../../src/lib/ocr/ocrSettings'
import type { PreprocessMode } from '../../src/lib/ocr/ocrSettings'
import { preprocess, resize, scaleFor } from '../../src/lib/ocr/preprocess'
import type { Pixels } from '../../src/lib/ocr/preprocess'

type Sample = { file: string; type: DocumentTypeId; applicant: Applicant; quality?: string; expectVerdict?: string }
type Labels = { today?: string; samples: Sample[] }
type OcrResult = { text: string; confidence: number; ms: number }

// ---- Arguments ---------------------------------------------------------------

const args = process.argv.slice(2)
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const root = resolve(arg('dir', 'ocr-samples'))
const modes = arg('modes', 'none,gray,binary').split(',') as PreprocessMode[]
const psms = arg('psm', OCR_SETTINGS.pageSegMode).split(',')
const langPath = process.env.OCR_LANG_PATH

// ---- Images ------------------------------------------------------------------

function decode(path: string): Pixels {
  const buf = readFileSync(path)
  if (/\.png$/i.test(path)) {
    const png = PNG.sync.read(buf)
    return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height }
  }
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
}

function encodePng(p: Pixels): Buffer {
  const png = new PNG({ width: p.width, height: p.height })
  png.data = Buffer.from(p.data)
  return PNG.sync.write(png)
}

// ---- OCR with a disk cache -----------------------------------------------------

const worker = await createWorker('eng', 1, {
  ...(langPath ? { langPath } : {}),
  cachePath: join(process.cwd(), 'node_modules', '.cache', 'tesseract'),
})
let currentPsm = ''

async function ocr(dir: string, file: string, mode: PreprocessMode, psm: string): Promise<OcrResult> {
  const path = join(dir, file)
  const key = createHash('sha1').update(`${file}|${statSync(path).size}|${mode}|${psm}|${OCR_SETTINGS.targetLongSide}`).digest('hex')
  const cacheDir = join(dir, '.ocr-cache')
  const cached = join(cacheDir, `${key}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8'))

  if (psm !== currentPsm) {
    await worker.setParameters({ tessedit_pageseg_mode: psm as never, preserve_interword_spaces: '1', user_defined_dpi: '300' })
    currentPsm = psm
  }
  const started = Date.now()
  const src = decode(path)
  const prepared = preprocess(resize(src, scaleFor(src.width, src.height, OCR_SETTINGS.targetLongSide)), mode)
  const { data } = await worker.recognize(encodePng(prepared))
  const result = { text: data.text, confidence: data.confidence, ms: Date.now() - started }
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cached, JSON.stringify(result))
  return result
}

// ---- Tampering: one wrong field per check ----------------------------------------

const tamper: Record<string, (a: Applicant) => Applicant> = {
  name: (a) => ({ ...a, lastName: a.lastName === 'Villareal' ? 'Fuentes' : 'Villareal', firstName: a.firstName === 'Rosario' ? 'Teodoro' : 'Rosario' }),
  address: (a) => ({ ...a, residenceAddress: 'Purok 9, Brgy. Datu Abdul Dadia, Panabo City' }),
  employer: (a) => ({ ...a, employer: 'Panabo City Water District' }),
  salary: (a) => ({ ...a, monthlySalary: Math.round(a.monthlySalary * 1.25) }),
  netPay: (a) => ({ ...a, netTakeHomePay: Math.round(a.netTakeHomePay * 1.25) }),
}

// ---- Scoring -------------------------------------------------------------------

type Tally = { genuine: Record<string, number>; caught: number; missed: number; tamperedTotal: number }
const newTally = (): Tally => ({ genuine: { pass: 0, warn: 0, fail: 0, info: 0 }, caught: 0, missed: 0, tamperedTotal: 0 })

type ConfigResult = {
  config: string
  typeCorrect: number
  total: number
  verdicts: Record<string, number>
  checks: Record<string, Tally>
  confidence: number
  ms: number
  failures: string[]
}

function score(r: ConfigResult) {
  // Average over checks of (genuine passes + tampered caught) / 2, plus type detection.
  const parts = Object.values(r.checks).map((t) => {
    const g = Object.values(t.genuine).reduce((a, b) => a + b, 0) - t.genuine.info
    const genuineOk = g ? t.genuine.pass / g : 1
    const caught = t.tamperedTotal ? t.caught / t.tamperedTotal : 1
    return (genuineOk + caught) / 2
  })
  const checks = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0
  return 0.8 * checks + 0.2 * (r.typeCorrect / r.total)
}

function evaluate(name: string, results: { dir: string; sample: Sample; ocr: OcrResult; today: Date }[]): ConfigResult {
  const out: ConfigResult = { config: name, typeCorrect: 0, total: results.length, verdicts: {}, checks: {}, confidence: 0, ms: 0, failures: [] }
  for (const { sample, ocr: o, today } of results) {
    out.confidence += o.confidence / results.length
    out.ms += o.ms / results.length
    const detected: DocumentAnalysis = analyzeDocument(o.text, sample.applicant, { confidence: o.confidence, today })
    if (detected.detectedTypeId === sample.type) out.typeCorrect++
    else out.failures.push(`${sample.file}: detected as ${detected.detectedTypeId}`)

    const genuine = analyzeDocument(o.text, sample.applicant, { typeId: sample.type, confidence: o.confidence, today })
    out.verdicts[genuine.verdict] = (out.verdicts[genuine.verdict] ?? 0) + 1
    for (const c of genuine.checks) {
      if (c.id === 'quality' || c.id === 'signature' || c.id === 'idNumber' || c.id === 'notExpired') continue
      const t = (out.checks[c.id] ??= newTally())
      t.genuine[c.status]++
      if (c.status === 'fail' || c.status === 'warn') out.failures.push(`${sample.file}: genuine ${c.id} ${c.status}: ${c.detail}`)

      const change = tamper[c.id]
      if (!change) continue
      const wrong = analyzeDocument(o.text, change(sample.applicant), { typeId: sample.type, today })
      const wc = wrong.checks.find((x) => x.id === c.id)
      if (!wc || wc.status === 'info') continue
      t.tamperedTotal++
      if (wc.status === 'fail') t.caught++
      else if (wc.status === 'pass') {
        t.missed++
        out.failures.push(`${sample.file}: TAMPERED ${c.id} still passed: ${wc.detail}`)
      }
    }
  }
  return out
}

// ---- Main ----------------------------------------------------------------------

function labelDirs(dir: string): string[] {
  if (existsSync(join(dir, 'labels.json'))) return [dir]
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .flatMap((e) => labelDirs(join(dir, e.name)))
}

const dirs = labelDirs(root)
if (!dirs.length) {
  console.error(`No labels.json found under ${root}. See scripts/ocr-eval/README.md.`)
  process.exit(1)
}

const configs = modes.flatMap((m) => psms.map((p) => ({ mode: m, psm: p })))
const all: ConfigResult[] = []
for (const { mode, psm } of configs) {
  const rows: { dir: string; sample: Sample; ocr: OcrResult; today: Date }[] = []
  for (const dir of dirs) {
    const labels: Labels = JSON.parse(readFileSync(join(dir, 'labels.json'), 'utf8'))
    const today = labels.today ? new Date(labels.today) : new Date()
    for (const sample of labels.samples) {
      process.stdout.write(`\rReading ${sample.file.padEnd(40)} (${mode}, psm ${psm})`)
      rows.push({ dir, sample, ocr: await ocr(dir, sample.file, mode, psm), today })
    }
  }
  all.push(evaluate(`${mode} / psm ${psm}`, rows))
}
process.stdout.write('\r'.padEnd(80) + '\r')
await worker.terminate()

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-')
const lines: string[] = []
const log = (s = '') => {
  console.log(s)
  lines.push(s)
}

log(`# OCR evaluation, ${new Date().toISOString().slice(0, 16)}`)
log(`${all[0].total} documents from ${dirs.map((d) => d.replace(root, '') || '.').join(', ')}\n`)
log('| Settings | Score | Type detected | Verified | Needs review | Mismatch | Unreadable | OCR confidence | Time per doc |')
log('|---|---|---|---|---|---|---|---|---|')
const ranked = [...all].sort((a, b) => score(b) - score(a))
for (const r of ranked) {
  const v = (k: string) => pct(r.verdicts[k] ?? 0, r.total)
  log(`| ${r.config} | ${(score(r) * 100).toFixed(1)} | ${pct(r.typeCorrect, r.total)} | ${v('verified')} | ${v('review')} | ${v('mismatch')} | ${v('unreadable')} | ${r.confidence.toFixed(0)} | ${(r.ms / 1000).toFixed(1)}s |`)
}

const best = ranked[0]
log(`\n## Checks with the best settings (${best.config})\n`)
log('Genuine documents should pass; tampered ones (one field changed) should fail.\n')
log('| Check | Genuine: pass | Genuine: review | Genuine: false alarm | Tampered: caught | Tampered: slipped through |')
log('|---|---|---|---|---|---|')
for (const [id, t] of Object.entries(best.checks)) {
  const g = t.genuine.pass + t.genuine.warn + t.genuine.fail
  log(`| ${id} | ${pct(t.genuine.pass, g)} | ${pct(t.genuine.warn, g)} | ${pct(t.genuine.fail, g)} | ${pct(t.caught, t.tamperedTotal)} | ${pct(t.missed, t.tamperedTotal)} |`)
}
const [mode, psm] = best.config.split(' / psm ')
log(`\nRecommended in src/lib/ocr/ocrSettings.ts: preprocess '${mode}', pageSegMode '${psm}'.`)
log(`\n## Problems to look at (${best.failures.length})\n`)
for (const f of best.failures.slice(0, 60)) log(`- ${f}`)

writeFileSync(join(root, 'report.md'), lines.join('\n') + '\n')
console.log(`\nSaved ${join(root, 'report.md')}`)
