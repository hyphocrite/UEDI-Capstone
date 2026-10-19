# Training and testing the document OCR

The Loan Application page reads each supporting document with Tesseract (in the browser),
then checks it against the form: name, address, employer, monthly salary, net take-home pay
and date. This folder measures how often those checks are right, so changes can be judged by
numbers instead of by trying a few photos.

## What "training" means here

Tesseract's text recognition is already trained on printed English, and retraining it is
rarely worth it. That takes thousands of labeled line images and helps only when one specific
font is consistently misread. Most errors on IDs and payslips come from other places, and
those are what we tune:

| Lever | Where | What it fixes |
| --- | --- | --- |
| Image cleanup | `src/lib/ocr/preprocess.ts`, `ocrSettings.ts` (`preprocess`, `fallback`) | Shadows, dim photos, grey paper |
| Page layout mode | `ocrSettings.ts` (`pageSegMode`) | Tables and two-column payslips read in the wrong order |
| Extractors | `src/lib/ocr/extractors.ts` | Finding basic salary, net pay, pay period and dates in each layout |
| Matching | `src/lib/ocr/matching.ts` | OCR slips (0/O, 1/I), merged names (DELACRUZ), address spelling |
| Keywords | `src/lib/ocr/documentTypes.ts` | Telling a payslip from an ID from a barangay certificate |
| Tolerances | `ocrSettings.ts` (`salaryTolerance`, `netPayTolerance`) | Rounded amounts on the form vs exact amounts on the payslip |

The loop:

1. Collect labeled documents (below).
2. Run `npm run ocr:eval`. Read `report.md`.
3. For each problem, open the OCR text and fix the extractor or matcher. Add that OCR
   text as a unit test in `src/lib/ocr/ocr.test.ts`, so it stays fixed.
4. Run the evaluation again. OCR results are cached, so this takes seconds. Keep the
   change if the score went up and nothing new slipped through.

## Try it on synthetic documents first

```
pip install pillow
npm run ocr:samples          # 24 fake payslips, IDs, barangay certificates and forms
npm run ocr:eval -- --dir ocr-samples/synthetic
```

## Collecting real documents

- Ask members for **consent**, and say the photos are only used to test the system.
- Aim for 20 to 30 of each type: DNSC payslips, IDs (several kinds), barangay certificates or
  bills, and signed forms. Use several phones, with good and bad lighting.
- Put them in `client/ocr-samples/real/`. That folder is in `.gitignore`. **Never commit
  real documents**, and delete them when testing is done.
- Add a `labels.json` next to them. List what the applicant would truthfully type on the form for
  each document:

```json
{
  "today": "2026-10-20",
  "samples": [
    {
      "file": "payslip-santos.jpg",
      "type": "payslip",
      "applicant": {
        "lastName": "Santos", "firstName": "Maria", "middleInitial": "C",
        "residenceAddress": "Purok 5, Brgy. New Visayas, Panabo City",
        "employer": "Davao del Norte State College",
        "monthlySalary": 27000, "netTakeHomePay": 18450
      }
    }
  ]
}
```

`type` is one of `valid_id`, `employee_id`, `payslip`, `certificate_of_employment`,
`proof_of_address`, `application_form` or `other`. `today` is the date the checks treat as
today, so "recent" checks stay stable.

## Running the evaluation

```
npm run ocr:eval -- --dir ocr-samples/real --modes none,gray,binary --psm 3,4,6
```

For each document, the checks run twice:

- **Genuine:** run with the true values. Each check should pass. A "false alarm" means a
  good applicant would be flagged.
- **Tampered:** one field is changed (another name, salary +25%, net pay +25%, another address,
  another employer). That check should fail. "Slipped through" is the dangerous number.

`report.md` ranks every combination of image cleanup and layout mode. It then lists the
problems behind the best one. Copy the recommended settings into `src/lib/ocr/ocrSettings.ts`.
Set `OCR_LANG_PATH` to a folder with `eng.traineddata` if this machine can't download it.
