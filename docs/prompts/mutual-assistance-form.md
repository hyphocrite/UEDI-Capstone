# Prompt: Mutual Assistance form on the Loan Application page

Apply the "ML training and OCR" patch first (it adds `ml-service/`, the new API fields and
the OCR checks this prompt relies on). Then paste everything below the line into Claude Code
(VS Code), at the repo root, on that branch.

---

Rebuild the Loan Application page (`client/src/pages/LoanApplicationPage.tsx`) so it follows UEDI's paper form, the "Mutual Assistance Application Form" of United DNSC Employees, Inc. The page should also take photos of the supporting documents and check them against what the applicant typed.

**What already exists (use it, don't rewrite it):**
- **API:** `POST /api/applications`. The body must match `createSchema` in `server/src/routes/applications.js`, which has `applicant`, `loan`, `bookkeeper`, `agreement` and `documents`. It responds with `{ application }`, already scored by the ML service.
- **OCR, in `client/src/lib/ocr/`:**
  - `extractText(file, onProgress)` in `textExtract.ts`, and `isSupportedFile`.
  - `analyzeDocument(text, applicant, { typeId, confidence })` and the `Applicant` type in `analyzeDocument.ts`.
  - `DOCUMENT_TYPES`, `documentType()` and `REQUIRED_DOCUMENTS[loanType]` in `documentTypes.ts`.
  - `sha256HexFromFile` in `fileHash.ts`.
  - Keep using `components/loan-application/DocumentCard.tsx` for each uploaded file. Its type dropdown changes which type the file is checked as. Set it to the slot's type on upload, and make the checklist follow whatever type it ends up as.
- **Types and helpers:** `client/src/lib/applications.ts` has `LoanType`, `EmploymentStatus`, `loanTypeLabel`, `employmentStatusLabel` and `monthlyInstallment()`.
- **Style:** if `.claude/skills/uedi-ui-conventions/SKILL.md` exists, follow it. Either way, use the palette tokens, `card`, `btn-primary`, `btn-ghost`, `input`, `label`, `PageHeader` and the existing `Modal`.
- **Known breakage:** the page doesn't compile right now. It still uses the old applicant fields (`fullName`, `dateOfBirth`, `monthlyIncome`) and `requiredDocuments`, which was removed from `data/mock.ts`. Fixing that is part of this task.

**Layout.** Use the paper form's order and wording, each section in a `card`.

1. **Applicant**
   - Name as three inputs on one row, in this order: Last Name, First Name, Middle Initial.
   - Residence Address.
   - Employer, defaulting to "Davao del Norte State College".
   - Employment status: permanent, temporary, contractual, or job order / contract of service.
   - Monthly Salary and Net take-home pay.
   - Date of birth (optional; the ML model uses it for age).
   - Below that, a "History with UEDI" group: years as member, past loans, late payments.
   - Keep the optional member picker. Picking a member fills in the name, member ID and the history fields, using the existing `memberHistory()`. Mock members have a single `name`. Split it in code, keeping two-word surnames like "Dela Cruz" and "De Guzman" together.
2. **Application Agreement**
   - Date, defaulting to today.
   - Loan type as two choices: "Long term" and "Emergency".
   - Amount in pesos.
   - Purpose (optional).
   - Period: a number plus a years/months selector. Convert it to `termMonths`, up to 120.
   - Rate in % per month, editable. Default to 1.0 for long term and 1.5 for emergency. Only change it on a loan-type switch if the user hasn't edited it.
   - Deduction: quincenal or monthly.
   - Show the installment from `monthlyInstallment()`: per month, and per quincena (half) when quincenal is chosen.
   - Show an amber note, without blocking submission, when the monthly installment is over half of the monthly net take-home pay, or when net pay left after it is under ₱5,000.
   - Two required checkboxes, with these exact sentences from the form:
     - "I hereby authorize the Payroll Officer of my Employer, DNSC and/or the Treasurer of United DNSC Employees, Inc. to deduct the quincenal/monthly installment of my Mutual Assistance from my salary or from any form of benefits due to me."
     - "Further, I agree to the automatic re-structuring of my Mutual Assistance upon its maturity."
3. **To be filled up by the Bookkeeper.** Mutual Assistance balance to date, as long-term balance + due date and short-term balance + due date. Optional, default 0.
4. **Supporting documents**
   - One upload slot for each type in `REQUIRED_DOCUMENTS[loanType]`, showing its `label` and `hint`. One file per slot; a new upload replaces the old one. Add an "Add another document" area, typed `other`, that takes several files.
   - Each slot has two buttons:
     - "Take photo": `accept="image/*"` with `capture="environment"`.
     - "Choose file": `accept="image/*,application/pdf"`, no `capture`, so the gallery and PDFs still work.
   - For each file, run `extractText`, then `analyzeDocument` with `typeId` set to the slot's type. If the detected type is a different type, and not `other`, warn: "This looks like a {detected label}".
   - Re-run `analyzeDocument` on the stored text, without OCR-ing again, whenever the applicant fields change.
   - Show a checklist of each required document's verdict.
   - Keep the existing duplicate-file warning (same SHA-256). It doesn't block submission.
   - If switching loan type removes a slot that has a file, move the file to "Add another document" rather than dropping it.
5. **Submit**
   - Validate required fields, net take-home pay ≤ monthly salary, late payments ≤ past loans, both agreement boxes, and every required slot filled and finished reading.
   - If any document's verdict is `mismatch`, ask "Submit with N documents that don't match?" in a `Modal` before sending. Officers still see these documents.
   - Send the body exactly as `createSchema` expects. For `documents`, send `{ fileName, type, verdict, sha256, notes }`. `notes` holds the `"Label: detail"` text of every check that is `fail` or `warn`.
   - After submitting, show the application number and the ML suggestion, with a link to `/loans/pending`.

**Don't:**
- Don't add the Approved / Credit Committee signature block. Approval happens on the Pending Loans page.
- Don't change `server/`, `ml-service/` or the logic in `client/src/lib/ocr/`. If you find an OCR bug, tell me rather than working around it in the page.
- Don't add dependencies.
- Keep the page lazy-loaded in `App.tsx`. Split it into components under `client/src/components/loan-application/`, keeping each file under about 400 lines.
- Make it work at phone width (375px). Grids need `grid-cols-1` and `min-w-0` on their children, so long OCR text doesn't widen the page.

**Done when:**
- `npm --prefix client run build`, `npm --prefix client run lint` and `npm --prefix client test` all pass.
- An end-to-end submission works:
  - Run `npm run ml:train` once, then keep `npm run ml` and `npm run dev` running. MongoDB must be running, and `server/.env` must exist.
  - Make sample photos with `pip install pillow` and `npm --prefix client run ocr:samples`. They're written to `client/ocr-samples/synthetic/`. Type the values for one person from its `labels.json`.
  - Submit an application with those photos. It should show up on Pending Loans.

Then tell me what you changed and anything you weren't sure about.
