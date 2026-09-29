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
- Members, loans, plans and reports use **sample data** from `client/src/data/mock.ts` for
  now. Settings save to the browser only. These move to MongoDB next, once UEDI's
  process is final.

## Project layout

```
client/   React 19 + Vite + Tailwind CSS (UI)
server/   Express + Mongoose (API)
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
4. Open http://localhost:5173 and click **Create account**.

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

## Tests

The server has an integration test for sign up, login and logout. It needs a running MongoDB:

```
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
```

## Color palette

| Use | Color |
| --- | --- |
| Top header, primary | `#0B422A` |
| Page background | `#F7F9F6` |
| Accent | `#10B981` |
| Text | `#0D1F17` |
