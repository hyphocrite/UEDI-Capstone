// Settings for reading documents. scripts/ocr-eval measures how well each choice works on
// a labeled set of real documents and prints which to use; change them here.

import type { Tolerance } from './matching'

export type PreprocessMode = 'none' | 'gray' | 'binary'

export const OCR_SETTINGS = {
  /** Image cleanup before OCR. 'gray' boosts contrast; 'binary' also turns the page black and white
   *  with a local threshold, which keeps text in shadowed phone photos (best on the sample set). */
  preprocess: 'binary' as PreprocessMode,
  /** If the first read is less confident than this (0-100), try again with `fallback` and keep the better one. */
  retryBelowConfidence: 70,
  fallback: 'gray' as PreprocessMode,
  /** Tesseract page layout: '3' automatic, '4' one column of mixed sizes, '6' one uniform block. */
  pageSegMode: '3',
  /** Photos are resized so their longer side is about this many pixels. */
  targetLongSide: 2200,
  /** How far a document amount may be from what the applicant typed and still match. */
  salaryTolerance: { percent: 3, minimum: 200 } as Tolerance,
  netPayTolerance: { percent: 3, minimum: 200 } as Tolerance,
}
