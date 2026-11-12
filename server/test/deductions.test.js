// Payroll deduction runs end to end through the API.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { uri, setup, application, staffUp, releasedLoan, daysAgo } = require("./helpers");
const d = require("../src/services/deductions");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let q; // quincenal long-term loan, M-0300
let m; // monthly emergency loan, M-0300
let other; // quincenal loan of a member with a comma and quotes in the name

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  // Released Aug 1: quincenal due Aug 15, Aug 31, Sep 15, Sep 30…; monthly due Aug 31, Sep 30…
  q = await releasedLoan(t, staff, { memberId: "M-0300", releasedAt: "2026-08-01", loan: { loanType: "long_term", amount: 60000, termMonths: 24, paymentFrequency: "quincenal" } });
  m = await releasedLoan(t, staff, { memberId: "M-0300", releasedAt: "2026-08-01", loan: { loanType: "emergency", amount: 10000, termMonths: 6, monthlyRate: 1.5, paymentFrequency: "monthly" } });
  // A borrower whose name needs quoting in a CSV.
  const app = (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: {
    ...application(0, { applicant: { memberId: "M-0301", lastName: "Dela Cruz, Jr.", firstName: 'Ana "Annie"' }, loan: { amount: 20000, termMonths: 12 } }),
  } })).json.application;
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) {
    await t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body: { decision: "approved" } });
  }
  const loanId = (await t.call(`/applications/${app._id}`, { cookie: staff.officer.cookie })).json.application.loanId;
  other = (await t.call(`/loans/${loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: "2026-08-01", voucherNo: "CV-O" } })).json.loan;
});

after(async () => {
  if (uri) await t.close();
});

const bk = () => staff.signer.bookkeeper.cookie;
const tr = () => staff.signer.treasurer.cookie;
const call = (path, opts = {}) => t.call(path, { cookie: bk(), ...opts });
const lineOf = (run, loan) => run.lines.find((l) => l.loanNo === loan.loanNo);
const payments = async (loan) => (await call(`/loans/${loan._id}`)).json.payments;

test("building runs: valid cutoffs only, one run per cutoff, quincenal vs monthly lines", { skip }, async () => {
  assert.equal((await call("/deductions", { method: "POST", body: { cutoffDate: "2026-09-14" } })).status, 400);
  assert.equal((await call("/deductions", { method: "POST", cookie: staff.officer.cookie, body: { cutoffDate: "2026-09-15" } })).status, 403, "loan officers can't");

  const mid = (await call("/deductions", { method: "POST", body: { cutoffDate: "2026-09-15" } })).json.run;
  assert.equal(mid.status, "draft");
  assert.deepEqual(mid.lines.map((l) => l.loanNo).sort(), [q.loanNo, other.loanNo].sort(), "monthly loan not on the 15th");
  assert.equal(lineOf(mid, q).expected, 140_910);
  assert.equal(lineOf(mid, q).arrears, 281_820, "Aug 15 and Aug 31 still unpaid");
  assert.equal((await call("/deductions", { method: "POST", body: { cutoffDate: "2026-09-15" } })).status, 409, "duplicate run");

  const end = (await call("/deductions", { method: "POST", body: { cutoffDate: "2026-09-30" } })).json.run;
  assert.equal(end.lines.length, 3);
  assert.equal(lineOf(end, m).expected, m.schedule[1].totalDue);
  assert.equal(lineOf(end, m).arrears, m.schedule[0].totalDue);
  assert.deepEqual(end.lines.map((l) => l.borrowerName), [...end.lines.map((l) => l.borrowerName)].sort((a, b) => a.localeCompare(b, "en")));

  const list = (await call("/deductions")).json;
  assert.equal(list.runs.length, 2);
  assert.equal(list.runs[0].cutoff, "2026-09-30");
  assert.equal(list.runs[0].totals.expected, end.totals.expected);
  assert.ok(list.suggestedCutoff);
});

test("draft edits, sending, CSV export and import", { skip }, async () => {
  const run = (await call("/deductions")).json.runs.find((r) => r.cutoff === "2026-09-15");
  const full = (await call(`/deductions/${run._id}`)).json.run;
  const line = lineOf(full, other);
  assert.equal((await call(`/deductions/${run._id}/lines/${line._id}`, { method: "PATCH", body: { remove: true } })).status, 400, "removing needs a reason");
  const removed = (await call(`/deductions/${run._id}/lines/${line._id}`, { method: "PATCH", body: { remove: true, removedReason: "Paying cash this cutoff" } })).json.run;
  assert.equal(removed.totals.lines, 1);
  const restored = (await call(`/deductions/${run._id}/lines/${line._id}`, { method: "PATCH", body: { remove: false, expected: 100_000 } })).json.run;
  assert.equal(lineOf(restored, other).expected, 100_000);
  assert.equal((await call(`/deductions/${run._id}/export.csv`)).status, 409, "send before downloading");

  const sent = (await call(`/deductions/${run._id}/send`, { method: "POST" })).json.run;
  assert.equal(sent.status, "sent");
  assert.equal(lineOf(sent, q).remitted, 140_910, "remitted starts at expected");
  assert.equal((await call(`/deductions/${run._id}/lines/${line._id}`, { method: "PATCH", body: { expected: 1 } })).status, 409, "locked once sent");

  // The list for payroll: names with commas and quotes survive the round trip.
  const csvRes = await rawGet(`/deductions/${run._id}/export.csv`);
  assert.match(csvRes.type, /text\/csv/);
  assert.match(csvRes.disposition, /uedi-payroll-deductions-2026-09-15\.csv/);
  const rows = d.parseCsv(csvRes.body);
  assert.deepEqual(rows[0], ["Member ID", "Employee name", "Loan no.", "Loan type", "Amount to deduct"]);
  assert.ok(rows.some((r) => r[1] === 'Ana "Annie" C. Dela Cruz, Jr.' && r[4] === "1000.00"));
  assert.deepEqual(rows[rows.length - 1].slice(1, 3), ["TOTAL", "2 loans"]);

  const back = d.toCsv([[...rows[0], "Remitted"], ...rows.slice(1, -1).map((r) => [...r, r[2] === q.loanNo ? "1,409.10" : "0"]), ["", "", "MA-1999-0001", "", "", "5"]]);
  const imported = (await call(`/deductions/${run._id}/import`, { method: "POST", body: { csv: back } })).json;
  assert.deepEqual(imported.updates.map((u) => [u.loanNo, u.remitted]).sort(), [[other.loanNo, 0], [q.loanNo, 140_910]].sort());
  assert.deepEqual(imported.problems.map((p) => p.loanNo), ["MA-1999-0001"]);
});

/** GET returning the raw text, for the CSV download. */
async function rawGet(path) {
  const r = await fetch(t.baseUrl + path, { headers: { Cookie: bk() } });
  return { body: (await r.text()).replace(/^﻿/, ""), type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition") };
}

test("remittance, all-or-nothing posting, double posting, unposting", { skip }, async () => {
  const run = (await call("/deductions")).json.runs.find((r) => r.cutoff === "2026-09-15");
  const full = (await call(`/deductions/${run._id}`)).json.run;
  const qLine = lineOf(full, q);
  const oLine = lineOf(full, other);
  const remittance = { officialReceiptNo: "OR-9915", amountReceived: 140_910, receivedAt: "2026-09-20" };

  const noReason = await call(`/deductions/${run._id}/remittance`, { method: "PUT", body: { remittance, lines: [{ lineId: oLine._id, remitted: 0 }] } });
  assert.equal(noReason.status, 400);
  assert.match(noReason.json.error, /give a reason/);
  const saved = await call(`/deductions/${run._id}/remittance`, { method: "PUT", body: { remittance, lines: [{ lineId: oLine._id, remitted: 0, reason: "lwop" }, { lineId: qLine._id, remitted: 140_910 }] } });
  assert.equal(saved.status, 200, saved.json.error);
  assert.equal(lineOf(saved.json.run, other).result, "missed");
  assert.equal(saved.json.run.totals.missed, 1);

  // A cash payment that leaves less than the remitted amount makes one line invalid: nothing posts.
  const cash = (await call(`/loans/${q._id}/payments`, { method: "POST", body: { amount: q.balance - 100_000, paidAt: daysAgo(1), method: "cash" } })).json.payment;
  const blocked = await call(`/deductions/${run._id}/post`, { method: "POST" });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /more than the remaining balance/);
  assert.equal((await payments(q)).filter((p) => p.method === "payroll").length, 0, "nothing was posted");
  assert.equal((await call(`/deductions/${run._id}`)).json.run.status, "sent");
  await call(`/loans/${q._id}/payments/${cash._id}/void`, { method: "POST", body: { reason: "Test setup" } });

  const posted = await call(`/deductions/${run._id}/post`, { method: "POST" });
  assert.equal(posted.status, 200, posted.json.error);
  assert.equal(posted.json.run.status, "posted");
  assert.equal(posted.json.run.postedByName, "Test bookkeeper");
  const qPays = (await payments(q)).filter((p) => p.method === "payroll" && !p.voided);
  assert.equal(qPays.length, 1);
  assert.equal(qPays[0].amount, 140_910);
  assert.equal(qPays[0].paidAt.slice(0, 10), "2026-09-15", "dated the cutoff, no UTC shift");
  assert.equal((await payments(other)).filter((p) => p.method === "payroll").length, 0, "a missed line records no payment");
  const qAfter = (await call(`/loans/${q._id}`)).json.loan;
  assert.equal(qAfter.amountPaid, 140_910);
  assert.equal(qAfter.schedule[0].paid, 140_910, "applied to the oldest installment");
  assert.equal(qAfter.lastDeduction.result, "full");
  const oAfter = (await call(`/loans/${other._id}`)).json.loan;
  assert.deepEqual([oAfter.lastDeduction.result, oAfter.lastDeduction.reason], ["missed", "lwop"]);
  assert.ok((await call("/loans?status=missed_deduction")).json.loans.some((l) => l._id === other._id));

  assert.equal((await call(`/deductions/${run._id}/post`, { method: "POST" })).status, 409, "posted once only");
  assert.equal((await call(`/loans/${q._id}/payments/${qPays[0]._id}/void`, { method: "POST", body: { reason: "Entered twice" } })).status, 409, "run payments are undone by unposting");

  assert.equal((await call(`/deductions/${run._id}/unpost`, { method: "POST", body: { reason: "Wrong O.R." } })).status, 403, "Treasurer only");
  assert.equal((await call(`/deductions/${run._id}/unpost`, { method: "POST", cookie: tr(), body: {} })).status, 400, "reason required");
  const unposted = await call(`/deductions/${run._id}/unpost`, { method: "POST", cookie: tr(), body: { reason: "Wrong O.R. number" } });
  assert.equal(unposted.json.run.status, "sent");
  const voided = (await payments(q)).filter((p) => p.method === "payroll");
  assert.ok(voided.every((p) => p.voided), "the run's payments are voided, not deleted");
  assert.equal((await call(`/loans/${q._id}`)).json.loan.amountPaid, 0);
  assert.equal((await call(`/loans/${other._id}`)).json.loan.lastDeduction, undefined, "missed flag removed with the run");

  assert.equal((await call(`/deductions/${run._id}/post`, { method: "POST" })).status, 200, "can be posted again after correcting");
});

test("a separated member's loan is flagged, and later runs carry it with nothing to deduct", { skip }, async () => {
  const run = (await call("/deductions")).json.runs.find((r) => r.cutoff === "2026-09-30");
  await call(`/deductions/${run._id}/send`, { method: "POST" });
  const full = (await call(`/deductions/${run._id}`)).json.run;
  const lines = full.lines.map((l) => (l.loanNo === m.loanNo ? { lineId: l._id, remitted: 0, reason: "separated" } : { lineId: l._id, remitted: l.expected }));
  const saved = await call(`/deductions/${run._id}/remittance`, { method: "PUT", body: { remittance: { officialReceiptNo: "OR-9930", amountReceived: 1, receivedAt: "2026-10-05" }, lines } });
  assert.equal(saved.status, 200, saved.json.error);
  assert.equal((await call(`/deductions/${run._id}/post`, { method: "POST" })).status, 200);

  const flagged = (await call(`/loans/${m._id}`)).json.loan;
  assert.equal(flagged.collectFrom.source, "final_pay");
  assert.equal(flagged.lastDeduction.reason, "separated");

  const next = (await call("/deductions", { method: "POST", body: { cutoffDate: "2026-10-31" } })).json.run;
  const carried = lineOf(next, m);
  assert.equal(carried.expected, 0, "payroll won't deduct again");
  assert.equal(carried.reason, "separated");
  assert.ok(carried.arrears > 0);
  assert.equal(await mongoose.model("DeductionRun").countDocuments(), 3);
});
