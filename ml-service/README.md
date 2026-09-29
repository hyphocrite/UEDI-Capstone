# UEDI loan risk service

A small Python service that reads past UEDI loans, learns which applicants tended to
default, and suggests **approve**, **review** or **deny** for new applications. The
Express server calls it; loan officers see the result on the **Pending Loans** page.

## Setup

```
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python train.py                 # writes models/model.joblib and models/metrics.json
python -m uvicorn app:app --port 8000
```

From the repo root the same steps are `npm run ml:train` and `npm run ml`.
Tests: `python -m pytest -q` (train first).

## The models

Three models score every applicant, and a fourth combines them (a *stacking ensemble*):

| Model | Why it is here |
| --- | --- |
| XGBoost | Boosted trees. Strong on tabular data and picks up combinations such as informal income with high debt. |
| Random Forest | Many independent trees. Stable and hard to overfit. |
| Logistic Regression | A simple, explainable baseline. Each factor has one fixed weight. |
| Stacked ensemble | A logistic regression that learns how much to trust each of the three. This drives the suggestion. |

- **Imbalance:** defaults are rare, so every model uses class weights
  (`scale_pos_weight` for XGBoost, `class_weight="balanced"` for the others).
- **Validation:** 5-fold stratified cross-validation. The AUC and the share of past
  defaults each model caught are saved to `models/metrics.json` and shown on each card.
- **Explanations:** each card lists the factors that moved that applicant's score most
  (TreeSHAP for XGBoost and Random Forest, weight × value for Logistic Regression).
- **Suggestion:** risk below 20% is approve, 20% to 50% is review, 50% and above is deny
  (`Thresholds` in `uedi_ml/model.py`).

The percentages are **risk scores for ranking**, not exact odds of default. Because of the
class weights, the ensemble's score runs higher than the base models' scores. The loan
officer always makes the final call, and going against the suggestion requires a note.

## Using UEDI's real loan history

`data/sample_loans.csv` is **synthetic**. Until it is replaced, the Pending Loans page shows
a "trained on sample data" warning. To train on real data, export past loans to a CSV with
these columns (one row per loan):

| Column | Meaning |
| --- | --- |
| `age` | Age when the loan was granted |
| `employmentType` | `wage`, `self`, `informal` or `other` |
| `monthlyIncome`, `existingMonthlyDebt` | Pesos per month |
| `loanAmount`, `termMonths`, `annualRate` | Loan terms (rate in percent, add-on) |
| `yearsAsMember`, `priorLoans`, `priorLatePayments` | History with UEDI before this loan |
| `hasCoMaker`, `hasRetirementPlan`, `documentsFlagged` | 1 or 0 (flagged is a count) |
| `defaulted` | **1 if the loan went bad, 0 if paid.** This is what the models learn. |

Then train on it:

```
python train.py --data data/uedi_loans.csv
```

Keep real member data out of git.
