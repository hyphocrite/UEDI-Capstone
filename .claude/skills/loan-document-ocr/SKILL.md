---
name: loan-document-ocr
description: How the Loan Application page reads supporting documents (IDs, DNSC payslips, barangay certificates, the signed form) with client-side OCR and checks them against UEDI's Mutual Assistance form, and how to measure and improve accuracy. Use when adding a document type, fixing a wrong extraction or verdict, or tuning OCR.
---

# Loan document OCR

All OCR runs **in the browser**. No document leaves the member's machine, and only the
verdict, notes and SHA-256 hash are saved with the application.

Each document proves fields on UEDI's paper form:

| Form field | Proved by | Check |
| --- | --- | --- |
| Name (last, first, MI) | ID, payslip, proof of address | `matchName`: fuzzy, last and first close together |
| Residence address | proof of address (IDs: info only) | `matchAddress`: share of distinctive words found |
| Employer | payslip, DNSC ID, COE | `matchEmployer`: knows DNSC = Davao del Norte State College |
| Monthly salary | payslip basic salary (or gross), COE | within `salaryTolerance` |
| Net take-home pay | payslip net pay, x2 when semi-monthly | within `netPayTolerance` |

## Files (`client/src/lib/ocr/`)

| File | Role |
| --- | --- |
| `textExtract.ts` | `extractText(file)`: EXIF-rotated image, resize, cleanup, Tesseract; retries with the fallback cleanup when confidence is low. PDFs use the text layer, or render and OCR. |
| `preprocess.ts` | Pure pixel functions (contrast stretch, adaptive black-and-white), shared with the Node evaluation. |
| `ocrSettings.ts` | Cleanup mode, fallback, page layout mode, image size, amount tolerances. Tune these from the evaluation. |
| `documentTypes.ts` | `DOCUMENT_TYPES` (keywords, checks, max age), `REQUIRED_DOCUMENTS` per loan type, `detectDocumentType()` with decisive phrases. |
| `extractors.ts` | `extractName`, `extractPayslip` (basic, gross, net, semi-monthly, table layouts), dates (incl. "10th day of October" and pay periods), expiry, ID number. |
| `matching.ts` | Levenshtein similarity, OCR letter/digit fixes, name/address/employer matchers, tolerance. |
| `analyzeDocument.ts` | Runs the type's checks. Statuses are `pass`, `warn`, `fail` and `info`; `info` never changes the verdict. Verdict: `verified`, `review`, `mismatch` or `unreadable`. |
| `ocr.test.ts` | Unit tests on realistic OCR text (`npm --prefix client test`). |

A non-`verified` document counts toward `documentsFlagged`, an ML feature. So a check that's
too strict raises good applicants' risk scores.

## Improving accuracy ("training")

Tesseract itself isn't retrained. The evaluation in `client/scripts/ocr-eval/` (see its
README) measures the whole pipeline on labeled documents:

```
npm --prefix client run ocr:samples                     # synthetic set (needs Pillow)
npm --prefix client run ocr:eval -- --dir ocr-samples/real --modes none,gray,binary --psm 3,4,6
```

The loop:

1. Read `report.md`. "False alarm" means a genuine document failed. "Slipped through" means a
   tampered value passed, which is the worse error.
2. Look at the OCR text in `.ocr-cache/` for the failing file.
3. Fix the extractor or matcher, then paste that OCR text into a new test in `ocr.test.ts`.
4. Re-run. OCR is cached, so it's fast. Keep the change only if the score rises and nothing new
   slips through.

Real documents go in `client/ocr-samples/` (gitignored), with consent. Never commit them.

## Add a document type

1. Add the id to `DocumentTypeId`, and an entry in `DOCUMENT_TYPES` with at least 3 keyword
   regexes that tolerate OCR spacing (`pay\s*slip`). Add a `DECISIVE` phrase if it overlaps
   another type.
2. Pick `checks` and `maxAgeDays`, and add the type to `REQUIRED_DOCUMENTS` if needed.
3. Add a synthetic maker in `scripts/ocr-eval/make_samples.py` and tests in `ocr.test.ts`.

## Gotchas

- Tesseract silently drops dark regions of shadowed photos while still reporting high
  confidence. Confidence alone doesn't prove the whole page was read. The adaptive
  `binary` cleanup handles shadows.
- Keep the **legacy** pdfjs build. The modern one crashes on older browsers.
- tesseract.js downloads its worker and language data from cdn.jsdelivr.net on first use.
  Offline machines show `unreadable`. For the Node evaluation, set `OCR_LANG_PATH`.
- Prefer `warn`, which leads to review, over guessing. A wrong `mismatch` is worse than a
  `review`.
- OCR is a helper for the officer, not proof. The signature always needs an eye check.
