import { createWorker } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
// The legacy build supports older browsers still common on office PCs.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { OCR_SETTINGS } from './ocrSettings'
import type { PreprocessMode } from './ocrSettings'
import { preprocess, scaleFor } from './preprocess'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export const ACCEPTED_FILES = 'image/jpeg,image/png,image/webp,application/pdf'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 3

export type ExtractedText = {
  text: string
  /** 0–100. Tesseract's confidence; 100 for text taken straight from a digital PDF. */
  confidence: number
  source: 'ocr' | 'pdf-text'
  pages: number
}

type Progress = (fraction: number) => void

export function isSupportedFile(file: File): string | null {
  const name = file.name.toLowerCase()
  const okType =
    ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) ||
    /\.(jpe?g|png|webp|pdf)$/.test(name)
  if (!okType) return 'Upload a JPEG, PNG, WebP image or a PDF.'
  if (file.size > MAX_FILE_BYTES) return 'File is larger than 10 MB.'
  return null
}

// One Tesseract worker is shared and jobs run one at a time, so the progress
// callback always belongs to the file currently being read.
let workerPromise: Promise<Worker> | null = null
let currentProgress: Progress | null = null
let queue: Promise<unknown> = Promise.resolve()

function getWorker() {
  workerPromise ??= createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') currentProgress?.(m.progress)
    },
  }).then(async (worker) => {
    await worker.setParameters({
      // Tesseract's enum values are strings of the mode number.
      tessedit_pageseg_mode: OCR_SETTINGS.pageSegMode as never,
      // Keeps the gaps between a payslip's label and its amount on one line.
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    return worker
  })
  return workerPromise
}

function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job)
  queue = next.catch(() => undefined)
  return next
}

/** Draws the image at OCR size and applies the cleanup in `mode`. */
function prepareCanvas(source: CanvasImageSource & { width: number; height: number }, mode: PreprocessMode) {
  const scale = scaleFor(source.width, source.height, OCR_SETTINGS.targetLongSide)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (mode !== 'none') {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const out = preprocess({ data: img.data, width: img.width, height: img.height }, mode)
    ctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0)
  }
  return canvas
}

async function recognize(canvas: HTMLCanvasElement, onProgress: Progress) {
  const worker = await getWorker()
  currentProgress = onProgress
  try {
    const { data } = await worker.recognize(canvas)
    return { text: data.text, confidence: data.confidence }
  } finally {
    currentProgress = null
  }
}

/**
 * OCRs with the main cleanup; if Tesseract isn't confident, tries the fallback cleanup
 * too and keeps whichever read is more confident.
 */
async function ocrImage(source: CanvasImageSource & { width: number; height: number }, onProgress: Progress) {
  const { preprocess: mode, fallback, retryBelowConfidence } = OCR_SETTINGS
  const first = await recognize(prepareCanvas(source, mode), (p) => onProgress(p * 0.5))
  if (first.confidence >= retryBelowConfidence || fallback === mode) {
    onProgress(1)
    return first
  }
  const second = await recognize(prepareCanvas(source, fallback), (p) => onProgress(0.5 + p * 0.5))
  return second.confidence > first.confidence ? second : first
}

async function extractFromPdf(file: File, onProgress: Progress): Promise<ExtractedText> {
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES)

  // Digital PDFs (e-payslips, bank statements) carry real text: read it directly.
  let text = ''
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lines = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      lines.set(y, [...(lines.get(y) ?? []), item.str])
    }
    text += [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join(' ')).join('\n') + '\n'
  }
  if (text.replace(/\s/g, '').length >= 40) {
    onProgress(1)
    return { text, confidence: 100, source: 'pdf-text', pages: pageCount }
  }

  // Scanned PDF: render each page and OCR it.
  let ocrText = ''
  let confidenceSum = 0
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    const result = await ocrImage(canvas, (p) => onProgress((i - 1 + p) / pageCount))
    canvas.width = canvas.height = 0
    ocrText += result.text + '\n'
    confidenceSum += result.confidence
  }
  return { text: ocrText, confidence: confidenceSum / pageCount, source: 'ocr', pages: pageCount }
}

/** Reads the text of an image or PDF. Jobs are queued so only one runs at a time. */
export function extractText(file: File, onProgress: Progress = () => {}): Promise<ExtractedText> {
  return runExclusive(async () => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) return extractFromPdf(file, onProgress)
    // Honors the photo's EXIF rotation, so sideways phone photos read upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      const result = await ocrImage(bitmap, onProgress)
      return { ...result, source: 'ocr' as const, pages: 1 }
    } finally {
      bitmap.close()
    }
  })
}
