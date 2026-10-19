# UEDI loan risk service

A small Python service that learns from UEDI's past Mutual Assistance loans which
applications tended to go bad, and suggests **approve**, **review** or **deny** for new ones.
The Express server calls it, and loan officers see the result on the **Pending Loans** page.

## Setup

```
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
python train.py                 # sample data; writes models/model.joblib and models/metrics.json
python -m uvicorn app:app --port 8000
```

From the repo root, the same steps are `npm run ml:train` and `npm run ml`.
To run the tests, train first, then run `python -m pytest -q`.

## Training on UEDI's real loans

`data/sample_loans.csv` is **synthetic**. Until the models are trained on real loans, the
Pending Loans page warns that they were trained on sample data.

### 1. Export the loan records

Ask the bookkeeper for one row per past Mutual Assistance loan, as Excel or CSV. The more
of these columns, the better. Only the first group is required.

| Field | From | Required |
| --- | --- | --- |
| Loan type (Long term / Emergency), amount, period, rate % per month | Application agreement | yes |
| Monthly salary, net take-home pay | Applicant section | yes |
| How the loan ended (paid, delinquent, written off...) | Ledger | yes |
| Date applied | Form | recommended |
| Member ID | Records | recommended; used to count each member's earlier loans |
| Long-term and short-term balance at the time | Bookkeeper section | recommended |
| Date of membership, birthday, employment status | Member records | optional |

Values must be **as they were when the member applied**, not today's. A salary from after the
loan, or a balance that includes this loan, leaks the answer and makes the scores look better
than they are.

### 2. Decide what "defaulted" means

This matters more than any model setting. Agree on it with the treasurer and the Credit
Committee, then write it down. For example:

- **Defaulted (1):** still unpaid 90+ days after maturity, written off, or collected from
  benefits after the member left.
- **Not defaulted (0):** fully paid, or still paying on schedule.
- **Automatic restructuring at maturity is routine on UEDI's form.** Don't count it as a
  default by itself. Count it only when the restructured balance then went unpaid.

### 3. Map the columns and prepare the data

```
copy column_map.example.json column_map.json      # macOS/Linux: cp
```

Edit `column_map.json`:

- **`columns`:** UEDI's header on the left, our field on the right.
- **`values`:** how UEDI writes the loan types and employment statuses.
- **`defaulted`:** the rule from step 2.

Then run:

```
python prepare_data.py path\to\uedi_records.xlsx --map column_map.json
```

The script:

- cleans "₱12,500.00"-style amounts;
- turns years into months, and membership and birth dates into years as member and age;
- counts each member's earlier loans and late ones;
- drops names and IDs;
- checks every row and lists any it skipped, with the reason.

It writes `data/uedi_loans.csv`, which git ignores. The expected format is in
`data/uedi_loans_template.csv`.

### 4. Train and read the results

```
python train.py --data data/uedi_loans.csv
python train.py --data data/uedi_loans.csv --holdout-from 2025-01-01    # also test on the newest loans
```

The output shows, for each model:

- **AUC:** how well it ranks risky loans above safe ones. 0.5 is a coin flip; 0.7 to 0.8 is
  typical for credit.
- **"Catches":** the share of past defaults it would have sent to review or deny.
- **A cut-off table:** for each possible line, how many loans would have been approved, and
  how many past defaults would have slipped through.

The approve and deny lines are picked from your data:

- **Approve:** as high as possible while letting through at most 15% of past defaults
  (`--max-missed 0.15`).
- **Deny:** the lowest score where at least half of past loans went bad.

To set the lines yourself instead, pass `--approve 0.04 --deny 0.30`. They're saved with the
model, and `metrics.json` keeps the whole table.

`--holdout-from` trains on older loans and tests on newer ones. That's the most honest check
of how the models will do next year. If the holdout AUC is much lower than the
cross-validated one, the way loans are given or recorded has changed.

### 5. Use the new model

Restart `npm run ml`, or call `POST /reload` on the service. Existing applications keep their
old score until someone presses **Run models again** on Pending Loans.

**Small data:** with fewer than about 50 defaulted loans, every number swings a lot from run
to run. The script warns about this and uses fewer cross-validation folds. Treat the
suggestions as a second opinion until there's more history.

## The models

Three models score every application, and a fourth combines them (a *stacking ensemble*):

| Model | Why it is here |
| --- | --- |
| XGBoost | Boosted trees. Picks up combinations, such as a job-order employee on a long term. |
| Random Forest | Many independent trees. Stable and hard to overfit. |
| Logistic Regression | A simple, explainable baseline. Each factor has one fixed weight. |
| Stacked ensemble | Learns how much to trust each of the three. This drives the suggestion. |

**Features.** They come from the form, in `uedi_ml/features.py`:

- the share of net take-home pay the installment takes;
- net pay left after the installment;
- net pay vs salary, which is low when the member already has many deductions;
- loan size vs salary;
- existing UEDI balances;
- loan type, term and rate;
- tenure and past late payments;
- age and employment status, when the data has them.

Features whose columns are missing from the training data are left out automatically.

**Scores.** The base models are class-weighted because defaults are rare. The ensemble and
each model's displayed score are then calibrated, so a 12% means about 12 in 100 similar past
loans went bad. Each card lists the factors that moved that application's score most:
TreeSHAP for XGBoost and Random Forest, and weight × value for Logistic Regression. Installments
use add-on interest, the rate % per month times the term. If UEDI computes interest
differently, change `monthly_installment()` in `uedi_ml/features.py` and retrain.

The loan officer always makes the final call, and going against the suggestion requires a note.
