---
name: loan-document-ocr
description: How the Loan Application page reads and checks supporting documents (IDs, birth certificates, payslips, receipts) with client-side OCR. Use when adding a document type, fixing a wrong extraction or verdict, or changing OCR/PDF handling.
---

# Loan document OCR

All OCR runs **in the browser**. No document leaves the member's machine, and only the
verdict, notes and SHA-256 hash are saved with the application.

| File (in `client/src/lib/ocr/`) | Role |
| --- | --- |
| `textExtract.ts` | `extractText(file)`: tesseract.js (`eng`) for images. PDFs use `pdfjs-dist/legacy/build/pdf.mjs`: the text layer if it has 40+ characters, otherwise each page is rendered and OCR'd. Accepts JPEG/PNG/WebP/PDF up to 10 MB. |
| `documentTypes.ts` | `DOCUMENT_TYPES`: id, label, hint, detection `keywords`, `checks` to run, `maxAgeDays`. `detectDocumentType()` needs 2+ keyword hits, otherwise `other`. |
| `extractors.ts` | Field pulls: `extractName`, `extractDateOfBirth`, `extractIncome`, `extractPaidAmount`, `extractExpiryDate`, `extractLatestDate`, `extractEmployer`, `extractIdNumber`, plus `namesMatch`. |
| `analyzeDocument.ts` | Runs the checks for the type against the applicant and returns `verdict`: `verified`, `review`, `mismatch` or `unreadable`. |
| `fileHash.ts` | SHA-256 of the file, used to spot the same file uploaded twice. |
| `components/loan-application/DocumentCard.tsx` | Per-file UI: progress, detected type (overridable), extracted fields and checks. |

Checks (`CheckId`): `name`, `dateOfBirth`, `income` (within ±5% or ±₱500, from Chainscore),
`amount`, `recent` (uses `maxAgeDays`), `notExpired`, `employer`, `idNumber`.

## Why it matters downstream

Every document whose verdict isn't `verified` counts toward `documentsFlagged`, which
is a feature for the ML models (`toFeatures()` in `server/src/services/mlClient.js`). A
too-strict check raises applicants' risk scores, so test changes against real samples.

## Add a document type

1. Add the id to `DocumentTypeId` and an entry in `DOCUMENT_TYPES` with at least 3
   distinctive keyword regexes (case-insensitive, allow OCR spacing: `pay\s*slip`).
2. Pick `checks`, and set `maxAgeDays` if it must be recent.
3. If it needs a new field, add an extractor in `extractors.ts` and handle the check in
   `analyzeDocument.ts`.
4. Test with a clean scan, a phone photo and a PDF.

## Fixing a bad extraction

- Get the raw OCR text first (log `extractText` output). Most bugs are regexes meeting OCR
  noise: `0`/`O`, `1`/`l`, missing spaces, split lines.
- Names: labels such as "Name", "Surname / Given name" are handled, and lines naming
  other people (father, mother, employer contact) are skipped. Keep that when editing.
- ID numbers use a word boundary and a digit lookahead so words aren't captured as IDs.
- Prefer returning `null` (which leads to `review`) over guessing. A wrong `mismatch` is worse
  than a `review`.

## Gotchas

- Keep the **legacy** pdfjs build and its legacy worker. The modern build crashes on older
  browsers (`getOrInsertComputed is not a function`).
- tesseract.js downloads its worker and language data from cdn.jsdelivr.net on first
  use. Offline or blocked networks will fail OCR, and the card then shows `unreadable`.
- The Loan Application page is lazy-loaded in `App.tsx` because OCR is heavy. Keep it that way.
- OCR is a helper for the officer, not proof. Officers still look at the originals.

## Verify

```
npm --prefix client run lint
npm --prefix client run build
npm run dev   # then upload samples at http://localhost:5173/loans/apply
```
