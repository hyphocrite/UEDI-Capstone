---
name: retrain-loan-models
description: Retrain and benchmark the UEDI loan risk models (XGBoost, Random Forest, Logistic Regression, stacked ensemble) on real UEDI loan history CSVs. Use when new loan data arrives, when metrics or thresholds change, or when features are added.
---

# Retrain the loan risk models

Everything lives in `ml-service/`:

| File | Role |
| --- | --- |
| `uedi_ml/features.py` | `RAW_FIELDS` (the input columns) and `build_features()` (payment, DTI, loan-to-income, late-payment rate, one-hot employment) |
| `uedi_ml/model.py` | `make_stack()`: base models plus the LR meta-model; `Thresholds(approve=0.20, deny=0.50)`; `LoanRiskModel.explain()` |
| `train.py` | 5-fold stratified CV for each model and the ensemble, then fits and saves `models/model.joblib` and `models/metrics.json` |
| `app.py` | FastAPI: `GET /health`, `GET /model`, `POST /predict` |
| `generate_sample_data.py` | Synthetic data only. Never use it to judge real performance. |

## 1. Prepare the CSV

One row per past loan, with these exact columns:

```
age,employmentType,monthlyIncome,existingMonthlyDebt,loanAmount,termMonths,annualRate,
yearsAsMember,priorLoans,priorLatePayments,hasCoMaker,hasRetirementPlan,documentsFlagged,defaulted
```

- `employmentType` is one of `wage`, `self`, `informal`, `other`.
- Booleans are `1`/`0`. `documentsFlagged` is a count. `annualRate` is add-on percent.
- `defaulted` is 1 if the loan went bad, 0 if it was paid. Agree the definition with UEDI
  (for example, 90+ days past due) and write it down.
- Values must be as of **when the loan was granted**, not today, or the model leaks the future.
- `priorLatePayments` must not exceed `priorLoans` (the API rejects it with 422).
- Save it as `ml-service/data/uedi_loans.csv`. **Never commit real member data.**
  `.gitignore` ignores everything in `ml-service/data/` except `sample_loans.csv`.

Sanity check before training:
```
cd ml-service
python -c "import pandas as pd; d=pd.read_csv('data/uedi_loans.csv'); print(d.shape); print(d.defaulted.mean()); print(d.isna().sum()[lambda s:s>0])"
```
You want a few hundred defaults at least. Fewer than about 50 makes the CV metrics noisy.

## 2. Train and benchmark

```
python train.py --data data/uedi_loans.csv
```
It prints and saves, for each of XGBoost, Random Forest, Logistic Regression and the ensemble:
`aucRoc`, `accuracy`, `precision`, `recall`, `f1` (out-of-fold, 5-fold stratified).
`metrics.json` records `sampleData: false` once the file isn't `sample_loans.csv`, which
removes the "trained on sample data" warning in the UI.

How to read the results:
- **AUC** is the headline for ranking risk. 0.5 is a coin flip; 0.7 to 0.8 is typical for credit.
- **Recall** is the share of past defaults the model would have flagged. It matters most
  to UEDI, because a missed default costs more than a manual review.
- The ensemble should match or beat the best base model. If it doesn't, check for leakage
  or too little data before tuning.

Keep the previous `metrics.json` to compare against. Report before/after AUC and recall per model.

## 3. Tune thresholds

The suggestion comes from the ensemble risk score: below `approve` is approve, below
`deny` is review, and anything else is deny. After training on real data, choose thresholds from
the out-of-fold scores so that, for example, the review band catches most defaults while
keeping the review queue manageable. Then update `Thresholds` in `uedi_ml/model.py`. Scores are class-weighted,
so they are **risk scores, not calibrated probabilities**. Don't label them "chance of default".

## 4. Changing features

1. Add the raw column to `RAW_FIELDS` and derive it in `build_features()`. Add a plain
   label in `FEATURE_LABELS`.
2. Add the field to the pydantic `Applicant` in `app.py`.
3. Send it from `toFeatures()` in `server/src/services/mlClient.js`, adding it to
   `server/src/models/Application.js` and the form in `client/src/pages/LoanApplicationPage.tsx`
   if it's new input.
4. Retrain, then run the tests.

## 5. Verify and deploy

```
python -m pytest -q                       # in ml-service/
npm run ml                                # restart the service to load the new model
```
Existing applications keep their old score until someone presses **Run models again**.
`model.joblib` is gitignored, so each machine retrains. Record the data file and the
`version` from `metrics.json` in the PR description.
