---
name: retrain-loan-models
description: Retrain and benchmark the UEDI loan risk models (XGBoost, Random Forest, Logistic Regression, stacked ensemble) on UEDI's real Mutual Assistance loan records. Use when new loan data arrives, when cut-offs or the default definition change, or when features are added.
---

# Retrain the loan risk models

UEDI (United DNSC Employees, Inc.) lends to DNSC employees through "Mutual Assistance"
loans: long term or emergency, payroll-deducted, rate in % **per month**. Features follow the
paper form. Everything lives in `ml-service/`:

| File | Role |
| --- | --- |
| `uedi_ml/features.py` | `REQUIRED_FIELDS` (form fields), `OPTIONAL_FIELDS` (bookkeeper and member records), `FEATURE_SOURCES`, `build_features()`, `monthly_installment()` (add-on interest) |
| `uedi_ml/dataset.py` | `check_training_data()`: validates rows, lists skipped ones with row numbers, warns on small data |
| `uedi_ml/model.py` | `make_stack()` (class-weighted bases, unweighted LR meta), Platt calibrators per base, `Thresholds`, `LoanRiskModel.explain()` |
| `prepare_data.py` | UEDI's Excel/CSV export + `column_map.json` -> `data/uedi_loans.csv` (no names or IDs) |
| `train.py` | CV metrics, optional time holdout, picks the approve and deny cut-offs, saves `models/model.joblib` and `metrics.json` |
| `app.py` | FastAPI: `GET /health`, `GET /model`, `POST /predict`, `POST /reload` |
| `generate_sample_data.py` | Synthetic data only. Never use it to judge real performance. |

## 1. Prepare the data

1. Get one row per past loan from the bookkeeper (Excel or CSV). Required: loan type,
   amount, period, rate per month, monthly salary, net take-home pay, and how the loan
   ended. Recommended: date applied, member ID, LT/ST balances at the time. Optional:
   membership date, birthday, employment status.
2. Agree on the **default definition** with the treasurer and the Credit Committee, and
   write it in the PR. Automatic restructuring at maturity is routine on UEDI's form, so it
   is not a default by itself.
3. `cp column_map.example.json column_map.json`, then edit the `columns`, `values` and
   `defaulted` rule.
4. `python prepare_data.py path/to/records.xlsx --map column_map.json`. Read every
   "skipped row N: reason" line; fix them at the source if many.
5. **Never commit real member data.** `.gitignore` ignores `ml-service/data/*` except the
   sample and the template.

Values must be as of the application date. Today's salary, or balances that include the
loan itself, leak the answer.

## 2. Train and benchmark

```
python train.py --data data/uedi_loans.csv
python train.py --data data/uedi_loans.csv --holdout-from 2025-01-01
```

- **AUC** is the headline for ranking. "Catches" is the share of past defaults sent to
  review or deny.
- **The cut-off table:** the approve line is picked so at most `--max-missed` (default 15%)
  of past defaults would have been suggested approve. The deny line is the lowest score where
  at least half of past loans defaulted. Override with `--approve X --deny Y`.
- **Holdout** (train on older, test on newer loans) is the honest estimate. A big gap vs CV
  means drift.
- The ensemble should match or beat the best base model. If it doesn't, check for leakage or
  too little data before tuning.
- Fewer than ~50 defaults: numbers swing a lot. Say so when reporting.

Report before/after AUC and the chosen cut-offs. Keep the previous `metrics.json` to compare.

## 3. Changing features

1. Add the raw field to `REQUIRED_FIELDS` or `OPTIONAL_FIELDS` (with its blank default), and
   the derived feature to `FEATURE_SOURCES`, `build_features()` and `FEATURE_LABELS`.
2. Add it to `Applicant` in `app.py`, and to `NUMERIC` in `uedi_ml/dataset.py` if numeric.
3. Send it from `toFeatures()` in `server/src/services/mlClient.js`. If it's new input, also
   add it to `server/src/models/Application.js`, `createSchema` in
   `server/src/routes/applications.js`, and the Loan Application page.
4. Retrain, then run `python -m pytest -q`.

## 4. Deploy

Restart `npm run ml` or `POST /reload`. `model.joblib` is gitignored, so each machine
retrains. Old applications keep their score until **Run models again**. Put the data
file, the row count and `version` from `metrics.json` in the PR.
