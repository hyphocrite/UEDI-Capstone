# UDEI Loan and Retirement Plan System

Loan and retirement plan system for United DNSC Employees, Inc. (UDEI). Office staff use the web app
to take in Mutual Assistance loan applications, sign them, release loans, run payroll deductions and
keep members' retirement plans. Members apply and follow their loans on the web or on a phone app.

- **Web app**: React, Vite and Tailwind CSS (`client/`)
- **API**: Node.js, Express and MongoDB with Mongoose (`server/`)
- **Mobile app** for members: Expo and React Native (`mobile/`)
- **Loan risk models**: Python, FastAPI, scikit-learn and XGBoost (`ml-service/`)

## What it does

**Loan applications.** The Mutual Assistance Application Form, filled in by a Loan Officer for a member
or by members for themselves. Supporting documents (payslip, ID and so on) are optional: they are read
on the device with OCR and checked against the form, and anything that doesn't match is flagged. The
form keeps what was typed if the page is reloaded. Each application is scored by three models (XGBoost,
Random Forest, Logistic Regression) and a stacked ensemble, which suggest approve, review or deny.
See [ml-service/README.md](ml-service/README.md).

**Four-signature approval.** The Bookkeeper, Treasurer, CreCom Chairman and President sign in that order
on Pending Loans. The Bookkeeper checks the balances section, which is filled in from the ledger. A
signer going against the model's suggestion has to give a reason. The President's approval creates
the loan.

**Loans and the ledger.** The Treasurer releases an approved loan, which builds its payment schedule
(quincenal or monthly, interest on the remaining balance) and can pay off the borrower's older loans
from the proceeds. Payments are applied oldest installment first, interest before principal. Payments
can be voided but never deleted. Every amount is stored as whole centavos.

**Payroll deductions.** For each cutoff (the 15th and month-end), the Bookkeeper builds a run of what
each borrower owes, exports it for the payroll office, enters what payroll actually remitted, and posts
it, which records the payments. Missed and partial deductions are flagged on the loan. The Treasurer can
unpost a run.

**Members, Retirement Plans, Reports and Loan Settings** read from and save to MongoDB:

- **Loan Settings**: interest rate and longest term per loan type, minimum monthly salary and the branch
  list. The web form, the mobile app and the server all use these.
- **Reports**: daily, weekly, monthly and yearly. They download as CSV for Excel or print to PDF.

**Accounts and access.** New accounts confirm their email with a 6-digit code. Each role sees everything
the roles below it see, except Payroll Deductions, which only the Bookkeeper, Treasurer and Administrator get:

| Role | Adds |
| --- | --- |
| Member | My Loans, Apply for a Loan, Profile |
| Loan Officer, Bookkeeper | Pending Loans, Members, Member Accounts, Retirement Plans (Bookkeeper also: Payroll Deductions) |
| Treasurer | Reports, Payroll Deductions |
| CreCom Chairman, President | Loan Settings (terms, minimum salary, branches) |
| Administrator | Interest rates, Credit Model, user roles, Audit Log, Payroll Deductions |

The first account created becomes the administrator. Every account after that starts as a Member, and
an administrator gives staff their role. A member sees loans only after a Loan Officer links their
account to their UDEI member number on the Members page. Members never see model scores or other
members' records.

**Mobile app.** Members sign up with their member number, verify their email, apply, follow their
application through the four signers, see their schedule and payments, and get due-date reminders.
See [mobile/README.md](mobile/README.md).

### Member score, co-makers and early warning

- **Member score** (Members page, out of 100): an alternative-data credit score for every member, even
  with no loan history. Savings regularity (retirement plan contributions), meeting and PMES attendance
  (Attendance page), utility/load bills (recorded from proof on the member's score), co-maker record,
  how many members vouch for them, and past repayment. Parts without data are left out, not counted
  against the member; months after the last contribution anyone has on record count as "not entered
  yet", so import contributions regularly.
- **Co-makers**: each application names 1 or 2 members with accounts (Loan Settings sets how many).
  They confirm on their **Co-maker** page before the Bookkeeper can sign, see how the loans they
  vouched for are paid, and are emailed when they're named and when a payroll deduction is missed.
- **Early warning** (Loan Officer and up): the chance each active loan misses a payment in the next 60
  days, from a second XGBoost model in the ML service with plain reasons (e.g. stopped saving). It is
  trained on SAMPLE snapshots until there is history: `npm --prefix server run export:early-warning --
  snapshots.csv`, then `cd ml-service && python train_early_warning.py --data ../server/snapshots.csv`.
  `npm run ml:train` trains both models.

### Documents, sessions and addresses

- **Supporting documents** are stored in MongoDB (GridFS, bucket `applicationDocuments`), so no other
  storage service is needed. Atlas's free tier holds 512 MB in total; at a few hundred KB per photo that
  is a few thousand documents, so plan a paid tier or cleanup before then.
- **Sessions** end after 30 minutes without activity (with a one-minute warning) or after 8 hours.
  Logging out revokes the token; changing the password ends every other session.
- **Addresses** use the official PSGC list (`psgc-areas` package): province, city or municipality,
  barangay, then house, street or purok. They are still stored as one line of text.

## Project layout

```
client/      Web app (React 19, Vite, Tailwind CSS)
server/      API (Express 5, Mongoose)
mobile/      Member app (Expo, React Native)
ml-service/  Loan risk models (Python, FastAPI)
```

## Running it locally

1. Install [Node.js 20+](https://nodejs.org) and either
   [MongoDB Community Server](https://www.mongodb.com/try/download/community) or a free
   [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.
2. Create `server/.env` from the example, then set `MONGODB_URI` and a long random `JWT_SECRET`:
   ```
   cp server/.env.example server/.env
   ```
3. Install everything and start the API and web app:
   ```
   npm run install:all
   npm run dev
   ```
4. For the loan models, install [Python 3.11+](https://www.python.org). Then, in a second terminal:
   ```
   pip install -r ml-service/requirements.txt
   npm run ml:train
   npm run ml
   ```
5. Open http://localhost:5173 and click **Create account**. The verification code is printed in the
   server terminal unless email is set up (see below).

The pages run on port 5173 and forward `/api` calls to the API on port 5000.

Helper scripts, run from the repo root:

| Command | What it does |
| --- | --- |
| `npm --prefix server run dev:admin` | Creates or resets a local administrator account and prints its login. Refuses to run when `NODE_ENV=production`, but uses whatever `MONGODB_URI` says, so don't run it while `server/.env` points at the hosted database. |
| `npm --prefix server run seed:signers` | Creates one account for each signer role, all with the same password, to try the approval chain |
| `npm --prefix server run seed` | Adds five sample applications to Pending Loans |

### Email

Verification codes are sent one of two ways. Set either in `server/.env`:

- **Gmail**: `GMAIL_USER` and `GMAIL_APP_PASSWORD`, a Google
  [App Password](https://myaccount.google.com/apppasswords), which needs 2-Step Verification.
- **Brevo**: `BREVO_API_KEY` and `MAIL_FROM`, a sender verified in Brevo. Use this on hosts that block
  email ports, such as Render's free tier.

In production the server refuses to start without one of them.

### Using MongoDB Atlas

Put the Atlas connection string in `MONGODB_URI`, keeping `/udei?retryWrites=true&w=majority` at the
end. Some networks can't look up `mongodb+srv://` addresses. The server then retries through a public
DNS server by itself.

## Loading UDEI's records

The bookkeeper's spreadsheets, `UDEI LOANS-2026.xlsx` and `UDEI CONTRIBUTIONS 2026.xlsx`, load with
one command. It adds:

- every member, by UDEI number;
- each member's loan balance carried over from the ledger;
- the 2026 payments and releases, for Reports;
- each member's retirement plan and monthly contributions.

The files have no names, so members show as "Member No. 12" until staff type the name on the Members
page. Running the import again replaces what the last import wrote and keeps what staff entered.

```
npm --prefix server run import:udei -- --dry-run "UDEI LOANS-2026.xlsx" "UDEI CONTRIBUTIONS 2026.xlsx"
npm --prefix server run import:udei -- "UDEI LOANS-2026.xlsx" "UDEI CONTRIBUTIONS 2026.xlsx"
```

The dry run only reports what it would load. The import writes to `MONGODB_URI` in `server/.env`, so
point that at Atlas to load the hosted database.

**Carried-over balances.** The spreadsheet only has yearly totals, not rates or schedules, so these
balances appear in their own section of the Loans page. To have payroll deduct one, the Bookkeeper or
Treasurer sets the amount per deduction on the Members page. The balance then becomes a loan with that
schedule, and deduction runs include it.

The spreadsheets are members' financial records. `.gitignore` keeps `.xlsx`, `.xls` and `.csv` files
out of git; only the sample CSVs the ML service needs are tracked.

## Deployment

| Part | Where | Settings |
| --- | --- | --- |
| API (`server/`) | Render | `MONGODB_URI`, `JWT_SECRET` (32+ characters), `CLIENT_ORIGIN`, `ML_SERVICE_URL`, `BREVO_API_KEY`, `MAIL_FROM`, `NODE_ENV=production` |
| Web app (`client/`) | Vercel | `client/vercel.json` forwards `/api` to the Render API |
| Mobile app (`mobile/`) | EAS Build | `mobile/eas.json` sets `EXPO_PUBLIC_API_URL` for the preview APK. Build it with `eas build --profile preview --platform android` |
| Database | MongoDB Atlas | |

Secrets such as the Brevo key and the database password go only in the host's environment settings,
never in `eas.json` or anything else built into the apps.

## API

All amounts on the loan, deduction, member and plan routes are whole centavos (₱1 = 100). The web app
uses a session cookie; the mobile app sends `Authorization: Bearer <token>`. "Officer+" means Loan
Officer and every role above it.

**Accounts** (`/api/auth`)

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| POST | `/register` | Anyone | Create an account and email a verification code |
| POST | `/verify-email` | Anyone | Enter the code; signs the account in |
| POST | `/resend-verification` | Anyone | Email a new code (once a minute) |
| POST | `/login` | Anyone | Log in (403 `EMAIL_NOT_VERIFIED` until the email is verified) |
| POST | `/logout` | Anyone | Log out; the session token stops working even if it was copied |
| GET | `/me` | Anyone | Current session and when it expires |
| POST | `/refresh` | Signed in | "Stay signed in": a fresh session; the old token stops working |
| PATCH | `/profile` | Signed in | Change own name and branch |
| POST | `/password` | Signed in | Change own password |
| GET | `/users` | Officer+ | List accounts |
| PATCH | `/users/:id/member` | Officer+ | Link an account to a member number |
| PATCH | `/users/:id/role` | Admin | Change an account's role |

**Applications** (`/api/applications`)

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| POST | `/` | Signed in | Submit an application; it is scored right away |
| GET | `/` | Signed in | List applications (members: their own). `?status=pending`, `?awaiting=me` |
| GET | `/:id` | Signed in | One application (members don't get model scores) |
| POST | `/:id/approvals` | Signer whose turn it is | Approve or deny `{ decision, note, bookkeeper }` |
| POST | `/:id/assess` | Officer+ | Run the models again |
| PUT | `/:id/documents/:index` | Whoever filed it | Upload a supporting document's file (must be the file that was checked) |
| GET | `/:id/documents/:index/file` | Staff, and the applicant | The stored file, for the side-by-side viewer |
| GET | `/model` | Officer+ | Model version and cross-validation results |
| GET | `/model/benchmark` | Admin | Comparison of eight classifiers (Credit Model page) |

**Loans** (`/api/loans`)

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/` | Signed in | List loans (members: their own). `?status=`, `?q=` |
| GET | `/carried` | Signed in | Balances carried over from the spreadsheet ledger |
| GET | `/balances?memberId=` | Signed in | A member's balances for the application form |
| GET | `/:id` | Signed in | One loan with its schedule and payments |
| POST | `/:id/release` | Treasurer | Release an approved loan |
| POST | `/:id/payments` | Bookkeeper, Treasurer | Record a payment |
| POST | `/:id/payments/:paymentId/void` | Bookkeeper, Treasurer | Void a payment |

**Payroll deductions** (`/api/deductions`, Bookkeeper, Treasurer and Admin can view; Bookkeeper and Treasurer make changes)

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/` | List runs |
| POST | `/` | Start a run for a cutoff `{ cutoffDate }` |
| GET | `/:id` | One run with its lines |
| GET | `/:id/export.csv` | The list for the payroll office |
| PATCH | `/:id/lines/:lineId` | Change or remove a line |
| POST | `/:id/send` | Mark as sent to payroll |
| PUT | `/:id/remittance` | Enter what payroll remitted |
| POST | `/:id/import` | Read payroll's remittance CSV into the form (saves nothing) |
| POST | `/:id/post` | Post the run (records the payments) |
| POST | `/:id/unpost` | Undo a posted run (Treasurer) |

**Members, plans, reports and settings**

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET, POST | `/api/members` | Officer+ | List or add members |
| GET, PATCH | `/api/members/:memberId` | Officer+ | One member with their loan history, or edit them |
| POST | `/api/members/:memberId/payroll-deduction` | Bookkeeper, Treasurer | Set the deduction for a carried-over balance |
| GET | `/api/retirement-plans` | Officer+ | List plans |
| POST | `/api/retirement-plans` | Bookkeeper, Treasurer | Open a plan |
| GET | `/api/retirement-plans/:id` | Officer+ | One plan with its contributions |
| POST | `/api/retirement-plans/:id/contributions` | Bookkeeper, Treasurer | Record a contribution |
| POST | `/api/retirement-plans/:id/contributions/:contributionId/void` | Bookkeeper, Treasurer | Void a contribution |
| GET | `/api/reports?period=` | Treasurer+ | Collections, releases and applications per period |
| GET | `/api/settings` | Anyone | Loan Settings |
| PUT | `/api/settings` | CreCom Chairman+ (interest rates: Admin only) | Save Loan Settings |
| GET | `/api/members/mine` | Signed in | A linked member's own record, history and last application, to fill in their loan form |
| GET | `/api/audit` | Admin | The audit log (`?q=`, `?action=`, `?outcome=`, `?from=`, `?to=`, `?page=`) |
| GET | `/api/locations/provinces`, `/towns?province=`, `/barangays?town=`, `/parse?address=` | Signed in | Address dropdowns from the PSGC list, and splitting a typed address into them |
| GET | `/api/health` | Anyone | Server and database status |

**Mobile app** (`/api/member`): `register`, `verify-email`, `resend-verification` and `login`, then, for
member accounts only, `me`, `applications` (GET and POST) and `loans` (list and `/:id`). See
[mobile/README.md](mobile/README.md).

## Tests

The server tests cover accounts, roles and access, applications, the approval chain, loans and payments,
payroll deductions, members, plans, reports, settings and the mobile routes. They need a running
MongoDB, and use a separate `uedi_test` database that they wipe. The ML tests need a trained model.

```
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm --prefix server test
cd ml-service && python -m pytest -q
```

## Color palette

| Use | Color |
| --- | --- |
| Top header, sidebar, primary | `#0B422A` |
| Page background | `#F7F9F6` |
| Accent | `#10B981` |
| Text | `#0D1F17` |
