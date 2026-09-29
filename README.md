# UEDI Loan and Retirement Plan System

A MERN app (MongoDB, Express, React, Node) for UEDI staff to manage members, loans,
retirement plans, interest rates and reports.

## What works today

- **Account creation and login** are real: accounts are saved in MongoDB, passwords are
  hashed with bcrypt, and the session is an httpOnly JWT cookie. The first account
  created becomes the administrator; later accounts are staff.
- **All pages are built**: Home, Log in, Create account, Members, Loans, Retirement Plans
  (with what each member has left to pay), Settings (interest rates) and Reports (daily,
  monthly and yearly).
- **Loan applications and Pending Loans**: the Loan Application page (with OCR checks on
  supporting documents) saves applications to MongoDB. Each one is scored by three
  machine learning models (XGBoost, Random Forest and Logistic Regression) plus a stacked
  ensemble, which suggests approve, review or deny. Loan officers and administrators
  decide on the Pending Loans page. See [ml-service/README.md](ml-service/README.md).
- Members, loans, plans and reports use **sample data** from `client/src/data/mock.ts` for
  now. Settings save to the browser only. These move to MongoDB next, once UEDI's
  process is final.

## Project layout

```
client/      React 19 + Vite + Tailwind CSS (UI)
server/      Express + Mongoose (API)
ml-service/  Python FastAPI + scikit-learn/XGBoost (loan risk models)
```

## Running it locally (VS Code)

1. Install [Node.js 20+](https://nodejs.org) and either
   [MongoDB Community Server](https://www.mongodb.com/try/download/community) or a free
   [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.
2. Create `server/.env` from the example and set `MONGODB_URI` (and a long random `JWT_SECRET`):
   ```
   cp server/.env.example server/.env
   ```
3. Install everything and start both apps:
   ```
   npm run install:all
   npm run dev
   ```
4. For the loan models, install [Python 3.11+](https://www.python.org), then in a second terminal:
   ```
   pip install -r ml-service/requirements.txt
   npm run ml:train
   npm run ml
   ```
   Optional: `npm --prefix server run seed` adds five sample applications to Pending Loans.
5. Open http://localhost:5173 and click **Create account**.

The client runs on port 5173 and forwards `/api` calls to the server on port 5000.

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | Server and database status |
| POST | `/api/auth/register` | Create an account `{ fullName, email, password, branch }` |
| POST | `/api/auth/login` | Log in `{ email, password }` |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current session |
| GET | `/api/auth/users` | List accounts (signed in only) |
| POST | `/api/applications` | Submit a loan application; it is scored right away |
| GET | `/api/applications?status=pending` | List applications (`pending`, `approved`, `denied`) |
| GET | `/api/applications/model` | Model version and cross-validation results |
| GET | `/api/applications/:id` | One application with its model results |
| POST | `/api/applications/:id/assess` | Run the models again |
| POST | `/api/applications/:id/decision` | Approve or deny `{ decision, note }` (loan officer or admin; a note is required when going against the suggestion) |

## Tests

The server tests cover sign up, login, logout and the loan application routes. They need a
running MongoDB. The ML tests need a trained model:

```
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm --prefix server test
cd ml-service && python -m pytest -q
```

## Color palette

| Use | Color |
| --- | --- |
| Top header, primary | `#0B422A` |
| Page background | `#F7F9F6` |
| Accent | `#10B981` |
| Text | `#0D1F17` |
