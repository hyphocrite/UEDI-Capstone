---
name: run-uedi-locally
description: Start, seed and test the UEDI app locally (React client, Express API, Python ML service, MongoDB). Use when asked to run, start, debug startup, seed data or run the tests.
---

# Run UEDI locally

The app has three processes and one database:

| Part | Folder | Port | Start command (from repo root) |
| --- | --- | --- | --- |
| React client (Vite) | `client/` | 5173 | `npm run dev` (starts client and API together) |
| Express API | `server/` | 5000 | included in `npm run dev` |
| ML service (FastAPI) | `ml-service/` | 8000 | `npm run ml` |
| MongoDB | local or Atlas | 27017 | set by `MONGODB_URI` |

The client proxies `/api` to port 5000. The API calls the ML service at `ML_SERVICE_URL`.

## First-time setup

1. Node 20+, Python 3.11+, and MongoDB (Community Server or an Atlas connection string).
2. Create `server/.env` from the example and fill it in:
   ```
   cp server/.env.example server/.env
   ```
   - `MONGODB_URI` (for example `mongodb://127.0.0.1:27017/uedi`)
   - `JWT_SECRET`: a long random string. Never commit `.env`.
   - `ML_SERVICE_URL=http://127.0.0.1:8000`
3. Install dependencies:
   ```
   npm run install:all
   pip install -r ml-service/requirements.txt
   ```
   Prefer a virtual env in `ml-service/.venv` (it is gitignored).
4. Train the models once, which writes `ml-service/models/model.joblib`:
   ```
   npm run ml:train
   ```

## Every day

Use two terminals:
```
npm run ml        # terminal 1: ML service on :8000
npm run dev       # terminal 2: API on :5000 + client on :5173
```
Open http://localhost:5173. The **first account registered becomes admin**. Later
accounts are `staff`. Only `admin` and `loan_officer` can approve or deny loans.

Optional sample pending loans (needs the API's database and the ML service running):
```
npm --prefix server run seed
```

## Checks before handing over code

```
npm --prefix client run lint
npm --prefix client run build          # runs tsc -b, then vite build
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm --prefix server test
cd ml-service && python -m pytest -q   # needs a trained model
```
`npm test` at the root runs the server and ML tests together.

## Troubleshooting

- **"The ML service is not running. Start it with `npm run ml`."**: the API couldn't
  reach `ML_SERVICE_URL`. Start the service, and check the port.
- **ML service returns 503**: no model has been trained. Run `npm run ml:train`.
- **API exits at startup / Mongo errors**: check `MONGODB_URI` and that MongoDB is running.
- **Port already in use**: find the process with `pgrep -fa "vite|uvicorn|node src/index.js"`
  and stop it by PID. Don't use `pkill -f` with a broad pattern.
- **Applications show no suggestion**: the ML service was down when they were submitted.
  Start it and press **Run models again** on Pending Loans (`POST /api/applications/:id/assess`).

## Team conventions

- Juan (repo owner, GitHub `hyphocrite`) creates feature branches himself. Hand over code
  as a patch or zip unless he asks for a push.
- Ask before pushing, merging or opening PRs.
