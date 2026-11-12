// Builds REAL training rows for the early-warning model from the system's own history, so it can
// be retrained on UDEI's loans instead of the sample (ml-service/train_early_warning.py --data).
//
// For every month-end in the past, each loan that was active and not yet behind on that day gives
// one row: the same inputs the live model sees (services/earlyWarning.js, as of that day), and
// missed_next_60d = 1 if any installment due in the next 60 days wasn't fully paid within 15 days
// of its due date.
//
//   npm --prefix server run export:early-warning -- snapshots.csv
//   cd ml-service && python train_early_warning.py --data ../server/snapshots.csv
const path = require("node:path");
const fs = require("node:fs");
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const Loan = require("../src/models/Loan");
const Payment = require("../src/models/Payment");
const ledger = require("../src/services/ledger");
const { snapshotsFor } = require("../src/services/earlyWarning");

const DAY = 86_400_000;
const HORIZON = 60 * DAY;
const GRACE = 15 * DAY;

/** Month-ends from the first release up to 60 days ago (later ones have no outcome yet). */
function monthEnds(from, until) {
  const out = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  while (d <= until) {
    out.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 2, 0);
  }
  return out;
}

/** Paid toward the schedule by `date`, oldest installment first. */
const paidBy = (payments, date) => payments.filter((p) => p.paidAt <= date).reduce((a, p) => a + p.amount, 0);

async function main() {
  const out = process.argv[2] || "early-warning-snapshots.csv";
  await connectDb();
  const today = ledger.todayInManila();
  const all = await Loan.find({ status: { $in: ["active", "paid"] }, "release.releasedAt": { $exists: true } });
  const payments = await Payment.find({ loan: { $in: all.map((l) => l._id) }, voided: false }).lean();
  if (!all.length) throw new Error("No released loans yet.");
  const first = new Date(Math.min(...all.map((l) => l.release.releasedAt.getTime())));

  const rows = [];
  for (const asOf of monthEnds(first, new Date(today.getTime() - HORIZON))) {
    const live = all.filter((l) => {
      if (l.release.releasedAt > asOf || (l.paidOffAt && l.paidOffAt <= asOf)) return false;
      const mine = payments.filter((p) => String(p.loan) === String(l._id));
      const dueSoFar = l.schedule.filter((s) => s.dueDate <= asOf).reduce((a, s) => a + s.totalDue, 0);
      return paidBy(mine, asOf) >= dueSoFar; // only loans not yet behind: we predict the first slip
    });
    if (!live.length) continue;
    const snaps = await snapshotsFor(live, asOf);
    for (const loan of live) {
      const mine = payments.filter((p) => String(p.loan) === String(loan._id));
      const upcoming = loan.schedule.filter((s) => s.dueDate > asOf && s.dueDate <= new Date(asOf.getTime() + HORIZON));
      let cumulative = loan.schedule.filter((s) => s.dueDate <= asOf).reduce((a, s) => a + s.totalDue, 0);
      let missed = 0;
      for (const s of upcoming) {
        cumulative += s.totalDue;
        if (paidBy(mine, new Date(s.dueDate.getTime() + GRACE)) < cumulative) missed = 1;
      }
      const { id, ...features } = snaps.get(String(loan._id));
      rows.push({ snapshot_date: asOf.toISOString().slice(0, 10), loan: loan.loanNo, ...features, missed_next_60d: missed });
    }
  }
  if (!rows.length) throw new Error("No month-end snapshots yet: loans need at least 60 days of history.");
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => (r[c] === null || r[c] === undefined ? "" : r[c])).join(","))].join("\n");
  fs.writeFileSync(path.resolve(out), csv);
  const positives = rows.filter((r) => r.missed_next_60d).length;
  console.log(`Wrote ${rows.length} snapshots (${positives} missed a payment within 60 days) to ${path.resolve(out)}.`);
  if (positives < 10) console.log("Fewer than 10 missed payments: keep the sample-trained model until there is more history.");
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
