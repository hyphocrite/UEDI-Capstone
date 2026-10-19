// Image cleanup before OCR. Pure functions on RGBA pixels, so the browser (canvas
// ImageData) and the Node evaluation script (scripts/ocr-eval) run exactly the same code.

import type { PreprocessMode } from './ocrSettings'

export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

/** Scale factor that brings the longer side near `target`: phone photos shrink, small scans grow. */
export function scaleFor(width: number, height: number, target: number) {
  const long = Math.max(width, height)
  const scale = target / long
  // Don't bother for small changes; never upscale more than 2.5x (it only blurs).
  if (scale > 0.9 && scale < 1.15) return 1
  return Math.min(scale, 2.5)
}

/** Bilinear resize (the browser uses canvas drawImage instead; this is for Node). */
export function resize(src: Pixels, scale: number): Pixels {
  if (scale === 1) return src
  const width = Math.max(1, Math.round(src.width * scale))
  const height = Math.max(1, Math.round(src.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) / scale - 0.5)
    const y0 = Math.max(0, Math.floor(sy))
    const y1 = Math.min(src.height - 1, y0 + 1)
    const fy = Math.max(0, sy - y0)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) / scale - 0.5)
      const x0 = Math.max(0, Math.floor(sx))
      const x1 = Math.min(src.width - 1, x0 + 1)
      const fx = Math.max(0, sx - x0)
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c]
        const b = src.data[(y0 * src.width + x1) * 4 + c]
        const d = src.data[(y1 * src.width + x0) * 4 + c]
        const e = src.data[(y1 * src.width + x1) * 4 + c]
        data[(y * width + x) * 4 + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy
      }
    }
  }
  return { data, width, height }
}

function luminance(p: Pixels) {
  const g = new Uint8ClampedArray(p.width * p.height)
  for (let i = 0; i < g.length; i++) {
    const r = p.data[i * 4], gr = p.data[i * 4 + 1], b = p.data[i * 4 + 2]
    g[i] = 0.299 * r + 0.587 * gr + 0.114 * b
  }
  return g
}

/** Stretches the darkest 1% to black and the brightest 1% to white (fixes dim, grey photos). */
function stretch(gray: Uint8ClampedArray) {
  const hist = new Uint32Array(256)
  for (const v of gray) hist[v]++
  const cut = gray.length * 0.01
  let lo = 0, hi = 255, acc = 0
  while (lo < 255 && (acc += hist[lo]) < cut) lo++
  acc = 0
  while (hi > 0 && (acc += hist[hi]) < cut) hi--
  if (hi - lo < 10) return gray
  const out = new Uint8ClampedArray(gray.length)
  const k = 255 / (hi - lo)
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * k
  return out
}

/**
 * Black-and-white with a local threshold (Bradley-Roth): each pixel is compared with the
 * average of its neighbourhood, so shadows and uneven phone lighting don't wipe out text.
 */
function adaptiveThreshold(gray: Uint8ClampedArray, width: number, height: number) {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row
    }
  }
  const half = Math.max(8, Math.round(Math.min(width, height) / 32))
  const out = new Uint8ClampedArray(gray.length)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(width, x + half + 1)
      const sum =
        integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      out[y * width + x] = gray[y * width + x] < mean * 0.85 ? 0 : 255
    }
  }
  return out
}

/** Returns new pixels prepared for OCR. 'none' returns the input unchanged. */
export function preprocess(p: Pixels, mode: PreprocessMode): Pixels {
  if (mode === 'none') return p
  let g = stretch(luminance(p))
  if (mode === 'binary') g = adaptiveThreshold(g, p.width, p.height)
  const data = new Uint8ClampedArray(p.width * p.height * 4)
  for (let i = 0; i < g.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g[i]
    data[i * 4 + 3] = 255
  }
  return { data, width: p.width, height: p.height }
}
