# UDEI credit-score service (regression)

A small Python service that learns from UDEI's past Mutual Assistance loans how well each
borrower repaid, predicts a **credit score from 0 to 100** for new applications, and
suggests **approve**, **review** or **deny** from that score.
The Express server calls it, and loan officers see the result on the **Pending Loans** page.

## Setup

```
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt -r requirements-dev.txt   # the -dev file adds pytest and httpx for the tests
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
| Amortization due so far, and the part of it paid by each due date | Ledger / payroll deductions | yes |
| How the loan ended (paid, delinquent, written off...) | Ledger | optional |
| Date applied | Form | recommended |
| Member ID | Records | recommended; used to count each member's earlier loans |
| Long-term and short-term balance at the time | Bookkeeper section | recommended |
| Date of membership, birthday, employment status | Member records | optional |

Values must be **as they were when the member applied**, not today's. A salary from after the
loan, or a balance that includes this loan, leaks the answer and makes the scores look better
than they are.

### 2. The target: the Repayment Performance Score

The models are **regressors**. They learn a number, not a yes/no label:

> **Repayment Performance Score** = 100 × (amortization paid in full by each due date) ÷
> (amortization scheduled so far), from 0 to 100 with decimals.

A loan whose every installment was deducted on time scores 100. One where 22 of 24 were on
time and the other two were half paid scores about 95.8. This comes straight from the
ledger, so nobody has to agree on what "defaulted" means. Automatic restructuring at
maturity is routine on UDEI's form; count only the installments that were due before it.

### 3. Map the columns and prepare the data

```
copy column_map.example.json column_map.json      # macOS/Linux: cp
```

Edit `column_map.json`:

- **`columns`:** UDEI's header on the left, our field on the right. Map the ledger's
  "amortization due to date" to `amountScheduled` and "paid on time" to `amountPaidOnTime`,
  or map a ready-made score column to `repaymentScore`.
- **`values`:** how UDEI writes the loan types and employment statuses.
- **`defaulted`** (optional): a rule for which loans ended badly. Only used to count each
  member's earlier bad loans.

Then run:

```
python prepare_data.py path\to\udei_records.xlsx --map column_map.json
```

The script:

- cleans "₱12,500.00"-style amounts;
- turns years into months, and membership and birth dates into years as member and age;
- computes `repaymentScore`;
- counts each member's earlier loans and late ones;
- drops names and IDs;
- checks every row and lists any it skipped, with the reason.

It writes `data/uedi_loans.csv`, which git ignores. The expected format is in
`data/uedi_loans_template.csv`.

### 4. Benchmark, train and read the results

```
python benchmark.py --data data/uedi_loans.csv     # compares the 8 regressors, picks the ensemble
python train.py --data data/uedi_loans.csv         # trains the app's model
python train.py --data data/uedi_loans.csv --holdout-from 2025-01-01    # also test on the newest loans
python plot_results.py --data data/uedi_loans.csv  # figures for the paper
```

The output shows, for each model:

- **MAE:** how many score points off a prediction is, on average.
- **RMSE:** like MAE, but big misses count more.
- **R²:** the share of the variation in past scores the model explains (1 = perfect,
  0 = no better than always guessing the average).
- **A cut-off table:** for each possible credit-score line, how many loans would have been
  approved and how many past poor repayers (real score below 60) would have slipped through.
- **Type I and Type II errors** at the approve line: good repayers flagged, and poor
  repayers suggested for approval.

The approve and deny lines are picked from your data:

- **Approve:** the lowest score that lets through at most 15% of past poor repayers
  (`--max-missed 0.15`).
- **Deny:** the highest score below which at least half of past loans were poor repayers.

To set the lines yourself instead, pass `--approve 85 --deny 65`. They're saved with the
model, and `metrics.json` keeps the whole table.

### 5. Use the new model

Restart `npm run ml`, or call `POST /reload` on the service. Existing applications keep their
old score until someone presses **Run models again** on Pending Loans. Applications scored by
the older classification model still show their old score.

**Small data:** with fewer than about 200 loans, or 30 scoring below 60, every number swings
a lot from run to run. The script warns about this. Treat the suggestions as a second
opinion until there's more history.

## The models

`benchmark.py` compares the 8 regression algorithms from the research objective
(`uedi_ml/regressors.py`):

| Algorithm | Note |
| --- | --- |
| Linear Regression | Replaces Logistic Regression, which is a classifier. |
| Random Forest | Regressor version. |
| XGBoost | Regressor version (squared-error objective). |
| Ridge Regression | Replaces Naive Bayes, which has no regression form. |
| Support Vector Regression (SVR) | Regressor version of SVM. |
| KNN | Regressor version: averages the 15 most similar past loans. |
| Decision Tree | Regressor version. |
| MLP | Regressor version (neural network). |

The algorithms are ranked by R². The **stacked ensemble** combines the top-ranked ones that
SHAP can explain exactly (tree and linear models), with a Linear Regression meta-model whose
weights are kept non-negative. The benchmark tries the top 2 and the top 3 and the app uses
the better one. On the sample data that is Random Forest + XGBoost + Ridge Regression (Ridge and Linear
Regression tie at R² 0.250; Ridge is ahead in the fourth decimal).

**Features.** They come from the form, in `uedi_ml/features.py`:

- the share of net take-home pay the installment takes;
- net pay left after the installment;
- net pay vs salary, which is low when the member already has many deductions;
- loan size vs salary;
- existing UDEI balances;
- loan type, term and rate;
- tenure and past late payments;
- age and employment status, when the data has them.

Features whose columns are missing from the training data are left out automatically.

**Scores and SHAP.** Every model predicts the score directly, clipped to 0 to 100. Each card
lists the factors that moved that application's score most, in score points: TreeSHAP for
XGBoost and Random Forest, and weight × value for Linear Regression. The ensemble is a
weighted sum of its members, so its SHAP values are the same weighted sum of theirs: the
waterfall starts at the average applicant's score and adds up exactly to this application's
score. Installments charge the monthly rate on the remaining balance, as UDEI's ledger does
(2% a month for long term, 3% for short term).

The signers always make the final call, and going against the suggestion requires a note.

## Benchmark for the research paper

UDEI is a young association: its whole loan history is one year of ledgers, 45 borrowers
and 11 accounts on amnesty. That is too few to train or compare models on. So the
comparison runs on 3,000 UDEI-shaped sample loans (`generate_sample_data.py`), whose rates,
terms and bad-loan rate come from UDEI's records.

```
python benchmark.py                 # 5-fold CV repeated 5 times; about 10 minutes
python train.py
python plot_results.py
```

Each result is a mean and standard deviation over the 25 test folds. Results are written to
`models/benchmark_<dataset>.json` and `.md`; `plot_results.py` draws the R²/MAE comparison,
predicted vs actual, and the Type I / Type II matrices into `models/figures/`.

There is no class imbalance in regression, so SMOTE and class weights no longer apply. The
public German Credit data only records good or bad, so it cannot train a regressor; it
stays in `data/public/` for reference.

`data/public/german_credit.csv` is the South German Credit dataset (Grömping, 2019; UCI
Machine Learning Repository, CC BY 4.0), a corrected coding of Hofmann's Statlog German
Credit data, with English column names. `credit_risk` is 1 for good and 0 for bad loans.
