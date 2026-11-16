// Sample data for demos: payroll deduction runs in every state, early warning at every level, and
// meetings with attendance.
//   npm run seed:demo                         (the database in MONGODB_URI)
//   npm run seed:demo -- --perfect=12,15,40   (who has perfect attendance; default: the first 3
//                                              members with a linked sign-in account, else the first 3 members)
//   npm run seed:demo -- --remove             (delete all of it)
// A database that isn't on this computer also needs --yes.
//
// Payroll deductions use their own demo borrowers (member numbers DEMO-01 to DEMO-07) and runs that
// contain only their loans, so no real member's loan gets a payment. Attendance uses the real
// members, so their member scores show the difference. Everything it adds is marked as demo data,
// and running it again replaces what it added before.
const mongoose = require("mongoose");
const { connectDb } = require("../src/config/db");
const Member = require("../src/models/Member");
const User = require("../src/models/User");
const Loan = require("../src/models/Loan");
const Payment = require("../src/models/Payment");
const Meeting = require("../src/models/Meeting");
const DeductionRun = require("../src/models/DeductionRun");
const RetirementPlan = require("../src/models/RetirementPlan");
const BillRecord = require("../src/models/BillRecord");
const earlyWarning = require("../src/services/earlyWarning");
const ledger = require("../src/services/ledger");
const loans = require("../src/services/loans");
const runs = require("../src/services/deductionRuns");
const d = require("../src/services/deductions");

const DEMO = "Demo data (seed script)";
const DEMO_ID = /^DEMO-/;
// Services record who did what; the demo actions are signed by this name.
const demoUser = { _id: new mongoose.Types.ObjectId(), fullName: DEMO };

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const BORROWERS = [
  { memberId: "DEMO-01", firstName: "Andrea", lastName: "Villanueva", amount: 50000 },
  { memberId: "DEMO-02", firstName: "Benjie", lastName: "Castillo", amount: 75000 },
  { memberId: "DEMO-03", firstName: "Carmela", lastName: "Dizon", amount: 25000 },
  { memberId: "DEMO-04", firstName: "Danilo", lastName: "Esguerra", amount: 100000 },
  { memberId: "DEMO-05", firstName: "Elena", lastName: "Fajardo", amount: 50000 },
  { memberId: "DEMO-06", firstName: "Fernando", lastName: "Gonzaga", amount: 75000 },
  { memberId: "DEMO-07", firstName: "Gemma", lastName: "Hernandez", amount: 25000 },
];

async function main() {
  const uri = process.env.MONGODB_URI || "";
  const local = /localhost|127\.0\.0\.1/.test(uri);
  if (!local && !flag("yes")) {
    console.error("MONGODB_URI is not a database on this computer. Add --yes to really change it.");
    process.exit(1);
  }
  await connectDb();
  await removeDemo();
  if (flag("remove")) {
    console.log("Demo data removed.");
    return;
  }
  await seedDeductions();
  await seedSavingsAndBills();
  await seedMeetings();
  await reportEarlyWarning();
}

/** Deletes everything this script added before. */
async function removeDemo() {
  const demoLoans = await Loan.find({ memberId: DEMO_ID }).select("_id");
  const demoRuns = await DeductionRun.find({ createdByName: DEMO }).select("_id");
  const [p, r, l, m, mt, rp, b] = await Promise.all([
    Payment.deleteMany({ $or: [{ loan: { $in: demoLoans.map((x) => x._id) } }, { deductionRun: { $in: demoRuns.map((x) => x._id) } }] }),
    DeductionRun.deleteMany({ createdByName: DEMO }),
    Loan.deleteMany({ memberId: DEMO_ID }),
    Member.deleteMany({ memberId: DEMO_ID }),
    Meeting.deleteMany({ recordedByName: DEMO }),
    RetirementPlan.deleteMany({ memberId: DEMO_ID }),
    BillRecord.deleteMany({ memberId: DEMO_ID }),
  ]);
  if (p.deletedCount + r.deletedCount + l.deletedCount + m.deletedCount + mt.deletedCount + rp.deletedCount + b.deletedCount) {
    console.log(`Removed earlier demo data: ${r.deletedCount} runs, ${l.deletedCount} loans, ${p.deletedCount} payments, ${m.deletedCount} demo members, ${rp.deletedCount} plans, ${b.deletedCount} bills, ${mt.deletedCount} meetings.`);
  }
}

// ---- Payroll deductions ----------------------------------------------------------------------

/**
 * The cutoffs to use: the three latest that have passed (posted runs), the next one (already sent
 * to payroll, as the Bookkeeper does before the cutoff) and the one after (a draft).
 */
function cutoffs() {
  const today = ledger.todayInManila();
  const c3 = d.cutoffOnOrBefore(today);
  const c2 = d.cutoffOnOrBefore(new Date(c3.getTime() - 86_400_000));
  const c1 = d.cutoffOnOrBefore(new Date(c2.getTime() - 86_400_000));
  const c4 = d.nextCutoff(c3);
  const c5 = d.nextCutoff(c4);
  return { c1, c2, c3, c4, c5 };
}

/** A payment outside the runs (earlier payroll before the system, or cash at the office). */
async function pay(loan, amount, paidAt, method, reference) {
  await Payment.create({ loan: loan._id, amount, paidAt, method, reference, recordedBy: demoUser._id, recordedByName: DEMO });
}

/** A run with only the demo loans' lines (createRun would take every active loan due that day). */
async function demoRun(cutoff, demoLoans) {
  if (await DeductionRun.exists({ cutoffDate: cutoff })) {
    console.warn(`  A run for ${d.dayKey(cutoff)} already exists (not demo data); that state is skipped.`);
    return null;
  }
  const fresh = await Loan.find({ _id: { $in: demoLoans.map((l) => l._id) } });
  return DeductionRun.create({ cutoffDate: cutoff, lines: d.buildLines(fresh, cutoff), createdBy: demoUser._id, createdByName: DEMO });
}

const lineFor = (run, memberId) => run.lines.find((l) => l.memberId === memberId);

/** Records what payroll deducted, then posts. `outcomes` maps member ID to { remitted?, reason?, reasonNote? }. */
async function remitAndPost(run, outcomes, orNo) {
  const lines = run.lines.filter((l) => !l.removed).map((l) => {
    const o = outcomes[l.memberId] ?? {};
    return { lineId: String(l._id), remitted: o.remitted ?? l.expected, reason: o.reason, reasonNote: o.reasonNote };
  });
  const total = lines.reduce((s, l) => s + l.remitted, 0);
  await runs.saveRemittance(run, { remittance: { officialReceiptNo: orNo, amountReceived: total, receivedAt: run.cutoffDate }, lines });
  return runs.post(run, demoUser);
}

async function seedDeductions() {
  const { c1, c2, c3, c4, c5 } = cutoffs();
  console.log(`Payroll deductions: cutoffs ${[c1, c2, c3, c4, c5].map(d.dayKey).join(", ")}`);

  // Demo borrowers and their loans, released about five months ago; the installments before the
  // first demo run were deducted by payroll before (paid on their due dates).
  await Member.create(BORROWERS.map((b) => ({ memberId: b.memberId, firstName: b.firstName, lastName: b.lastName, employer: "Davao del Norte State College", status: "active", remarks: "Demo data" })));
  const releasedAt = new Date(c1.getTime() - 150 * 86_400_000);
  const demoLoans = [];
  for (const [i, b] of BORROWERS.entries()) {
    const created = await Loan.create({
      loanNo: `DEMO-MA-${String(i + 1).padStart(3, "0")}`,
      borrowerName: `${b.firstName} ${b.lastName}`,
      memberId: b.memberId,
      loanType: "long_term",
      principal: ledger.toCentavos(b.amount),
      monthlyRate: 1,
      termMonths: 12,
      paymentFrequency: "quincenal",
      existingBalances: 0,
    });
    const loan = await loans.release(created, { releasedAt, voucherNo: `DEMO-CV-${i + 1}` }, demoUser);
    for (const due of loan.schedule.filter((x) => x.dueDate < c1)) await pay(loan, due.totalDue, due.dueDate, "payroll", "Payroll deduction (before the demo runs)");
    await loans.recompute(loan);
    demoLoans.push(loan);
  }
  console.log(`  ${demoLoans.length} demo loans released ${d.dayKey(releasedAt)}, earlier installments paid`);

  // 1. Posted, all deducted in full.
  const run1 = await demoRun(c1, demoLoans);
  if (run1) {
    await runs.send(run1, demoUser);
    await remitAndPost(run1, {}, "DEMO-OR-1001");
    console.log(`  ${d.dayKey(c1)}: posted, all full`);
  }

  // 2. Posted with every outcome, one line removed in the draft, and posted, unposted, posted again.
  const run2 = await demoRun(c2, demoLoans);
  if (run2) {
    const removed = lineFor(run2, "DEMO-07");
    if (removed) {
      await runs.editLine(run2, String(removed._id), { remove: true, removedReason: "Paid this cutoff in cash at the UDEI office." });
      const gemma = demoLoans.find((l) => l.memberId === "DEMO-07");
      await pay(gemma, removed.expected, c2, "cash", "O.R. DEMO-CASH-01, paid at the office");
      await loans.recompute(await Loan.findById(gemma._id));
    }
    await runs.send(run2, demoUser);
    const expectedOf = (id) => lineFor(run2, id)?.expected ?? 0;
    const outcomes = {
      // DEMO-01: full (default)
      "DEMO-02": { remitted: Math.round(expectedOf("DEMO-02") / 2), reason: "other", reasonNote: "Payroll deducted half by mistake; the rest follows next cutoff." },
      "DEMO-03": { remitted: Math.round(expectedOf("DEMO-03") * 0.6), reason: "insufficient_pay" },
      "DEMO-04": { remitted: 0, reason: "lwop" },
      "DEMO-05": { remitted: 0, reason: "not_in_payroll" },
      "DEMO-06": { remitted: 0, reason: "separated", reasonNote: "Resigned from DNSC effective this month." },
    };
    // First posted with a wrong O.R. number, then unposted and corrected.
    await remitAndPost(run2, outcomes, "DEMO-OR-1O02");
    const unposted = await runs.unpost(await DeductionRun.findById(run2._id), "Wrong O.R. number entered (letter O instead of zero).", demoUser);
    await remitAndPost(unposted, outcomes, "DEMO-OR-1002");
    console.log(`  ${d.dayKey(c2)}: posted with full, partial (other, insufficient pay), missed (leave without pay, not in payroll, separated), a removed line, and one unpost`);
  }

  // 3. Posted: Benjie back to full, the others still short; Fernando carried over to final pay.
  const run3 = await demoRun(c3, demoLoans);
  if (run3) {
    await runs.send(run3, demoUser);
    const expectedOf = (id) => lineFor(run3, id)?.expected ?? 0;
    await remitAndPost(run3, {
      "DEMO-03": { remitted: Math.round(expectedOf("DEMO-03") * 0.5), reason: "insufficient_pay" },
      "DEMO-04": { remitted: 0, reason: "lwop" },
      "DEMO-05": { remitted: 0, reason: "not_in_payroll" },
      "DEMO-06": { remitted: 0, reason: "separated" },
    }, "DEMO-OR-1003");
    console.log(`  ${d.dayKey(c3)}: posted, mostly full; three still short and one carried over to final pay`);
  }

  // 4. Sent to payroll ahead of the cutoff, waiting for the remittance.
  const run4 = await demoRun(c4, demoLoans);
  if (run4) {
    await runs.send(run4, demoUser);
    console.log(`  ${d.dayKey(c4)}: sent, waiting for the remittance`);
  }

  // 5. Draft for the cutoff after: one amount changed and one line taken off.
  const run5 = await demoRun(c5, demoLoans);
  if (run5) {
    const changed = lineFor(run5, "DEMO-01");
    if (changed) await runs.editLine(run5, String(changed._id), { expected: Math.round(changed.expected * 1.5) });
    const off = lineFor(run5, "DEMO-05");
    if (off) await runs.editLine(run5, String(off._id), { remove: true, removedReason: "Not in this payroll period; on leave." });
    console.log(`  ${d.dayKey(c5)}: draft, one amount changed and one line removed`);
  }
}

// ---- Early warning: savings and bills that put each demo loan at a different level ----

// Per demo borrower: deposits in the last 12 recorded months (most recent last; null = no plan),
// bills, and how many of the 5 meetings they attended. Together with the deductions above:
//   low: 01 Andrea, 07 Gemma · watch: 02 Benjie · high: 03 Carmela, 04 Danilo, 05 Elena, 06 Fernando
const PROFILES = {
  "DEMO-01": { saved: "111111111111", bills: "on_time", meetings: 5 },
  "DEMO-02": { saved: "111111111001", bills: "on_time", meetings: 3 },
  "DEMO-03": { saved: "111111111000", bills: "late", meetings: 2 },
  "DEMO-04": { saved: null, bills: "unpaid", meetings: 0 },
  "DEMO-05": { saved: "111111110010", bills: "late", meetings: 1 },
  "DEMO-06": { saved: "111110000000", bills: "unpaid", meetings: 1 },
  "DEMO-07": { saved: "111111111111", bills: "on_time", meetings: 4 },
};

const monthOf = (key, add) => {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + add, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

async function seedSavingsAndBills() {
  // Savings are judged only up to the latest month anyone's deposit is recorded. Demo deposits end on
  // that same month, so they don't make real members look like they missed later months.
  const [latest] = await RetirementPlan.aggregate([
    { $match: { memberId: { $not: DEMO_ID } } },
    { $unwind: "$contributions" },
    { $match: { "contributions.voided": false } },
    { $group: { _id: null, month: { $max: "$contributions.month" } } },
  ]);
  const today = ledger.todayInManila();
  const lastMonth = monthOf(`${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`, -1);
  const until = latest?.month && latest.month < lastMonth ? latest.month : lastMonth;

  for (const b of BORROWERS) {
    const p = PROFILES[b.memberId];
    if (p.saved) {
      const months = Array.from({ length: 12 }, (_, i) => monthOf(until, i - 11));
      const contributions = months
        .filter((_, i) => p.saved[i] === "1")
        .map((month) => ({ month, amount: 150000, dues: 5000, paidAt: new Date(`${month}-28T00:00:00Z`), method: "payroll", reference: "Demo", recordedByName: DEMO }));
      await RetirementPlan.create({
        memberId: b.memberId, memberName: `${b.firstName} ${b.lastName}`, startDate: new Date(`${months[0]}-01T00:00:00Z`),
        monthlyContribution: 155000, planShare: 150000, contributions, createdByName: DEMO,
      });
    }
    // Six months of bills.
    await BillRecord.create(Array.from({ length: 6 }, (_, i) => ({
      memberId: b.memberId, kind: i % 2 ? "water" : "electricity", month: monthOf(lastMonth, -i),
      status: p.bills === "on_time" ? "on_time" : i < 3 ? p.bills : "on_time", recordedByName: DEMO,
    })));
  }
  console.log(`Savings and bills for the demo borrowers (deposits through ${until}, the latest month on record).`);
}

/** What Early Warning now says about the demo loans, when the ML service is reachable. */
async function reportEarlyWarning() {
  try {
    const { loans: list } = await earlyWarning.current();
    const demo = list.filter((l) => DEMO_ID.test(l.memberId || ""));
    console.log(`Early warning for the demo loans: ${demo.map((l) => `${l.memberId} ${l.level} (${Math.round(l.probability * 100)}%)`).join(", ")}`);
  } catch (err) {
    console.log(`Early warning not checked: ${err.message}`);
  }
}

// ---- Meetings and attendance ----------------------------------------------------------------

/** A repeatable pseudo-random sequence, so the same members miss the same meetings each time. */
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

async function seedMeetings() {
  const members = (await Member.find({ provisional: { $ne: true }, memberId: { $not: DEMO_ID } }).select("memberId fullName")).sort((a, b) =>
    a.memberId.localeCompare(b.memberId, "en", { numeric: true }),
  );
  if (members.length < 4) {
    console.warn("Meetings: fewer than 4 members on record; add members first.");
    return;
  }
  const ids = new Set(members.map((m) => m.memberId));

  // Perfect attendance: --perfect=..., else members with a linked sign-in account, else the first three.
  let perfect = option("perfect")?.split(",").map((s) => s.trim()).filter((s) => ids.has(s)) ?? [];
  if (!perfect.length) {
    const linked = await User.find({ memberId: { $in: [...ids] } }).select("memberId");
    perfect = [...new Set(linked.map((u) => u.memberId))].slice(0, 3);
  }
  for (const m of members) if (perfect.length < 3 && !perfect.includes(m.memberId)) perfect.push(m.memberId);
  perfect = perfect.slice(0, 3);

  // Five meetings over the last months: four general assemblies and a PMES.
  const today = ledger.todayInManila();
  const monthsAgo = (n, day) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - n, day));
  const plan = [
    { title: "General Assembly", kind: "general_assembly", date: monthsAgo(5, 20) },
    { title: "Pre-Membership Education Seminar (PMES)", kind: "pmes", date: monthsAgo(4, 8) },
    { title: "Mid-year General Assembly", kind: "general_assembly", date: monthsAgo(3, 26) },
    { title: "Loan Policy Orientation", kind: "general_assembly", date: monthsAgo(2, 14) },
    { title: "Quarterly General Assembly", kind: "general_assembly", date: monthsAgo(1, 18) },
  ];

  // Everyone else misses at least one: each attends a meeting about 60% of the time.
  const rand = seeded(42);
  const attendance = plan.map(() => new Set(perfect));
  for (const m of members) {
    if (perfect.includes(m.memberId)) continue;
    const went = plan.map(() => rand() < 0.6);
    if (went.every(Boolean)) went[Math.floor(rand() * plan.length)] = false;
    went.forEach((yes, i) => yes && attendance[i].add(m.memberId));
  }
  // Demo borrowers attend the number of meetings in their early warning profile (the latest ones).
  for (const [memberId, p] of Object.entries(PROFILES)) {
    for (let i = plan.length - p.meetings; i < plan.length; i++) attendance[i].add(memberId);
  }
  await Meeting.create(plan.map((p, i) => ({ ...p, attendees: [...attendance[i]], recordedByName: DEMO })));

  const names = members.filter((m) => perfect.includes(m.memberId)).map((m) => `${m.memberId} ${m.fullName}`);
  console.log(`Meetings: ${plan.length} created (${plan.map((p) => d.dayKey(p.date)).join(", ")})`);
  console.log(`  Perfect attendance (5 of 5): ${names.join("; ")}`);
  console.log(`  The other ${members.length - perfect.length} members each missed at least one; attendance per meeting: ${attendance.map((a) => a.size).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err.problems ? `${err.message}\n  ${err.problems.join("\n  ")}` : err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
