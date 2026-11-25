// Accounting's remittance list (xlsx/csv) filling in a sent deduction run: header detection, matching
// by employee no. and by name, ambiguous and not-found rows, run lines with no row, and the amount
// column picker remembered in Settings. Uses test/fixtures/remittance-list.xlsx (made-up names).
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { uri, setup, application, staffUp, approve } = require("./helpers");
const ri = require("../src/services/remittanceImport");

const skip = !uri && "TEST_MONGODB_URI not set";
const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures", "remittance-list.xlsx"));
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let t;
let staff;
let run;
const loans = {};

/** An approved and released quincenal loan (first due Aug 15) for a named borrower. */
async function loanFor(memberId, lastName, firstName, middleInitial = "") {
  const app = await approve(t, staff, application(0, {
    applicant: { memberId, lastName, firstName, middleInitial },
    loan: { amount: 60000, termMonths: 24, paymentFrequency: "quincenal" },
    bookkeeper: { longTermBalance: 0, shortTermBalance: 0 },
  }));
  const r = await t.call(`/loans/${app.loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: "2026-08-01", voucherNo: `CV-${memberId}` } });
  assert.equal(r.status, 200, r.json.error);
  return r.json.loan;
}

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  const added = await t.call("/members", { method: "POST", cookie: staff.officer.cookie, body: { memberId: "M-0601", lastName: "Santos", firstName: "Maria", middleInitial: "C", employeeNo: "E-1001" } });
  assert.equal(added.status, 201, added.json.error);
  loans.maria = await loanFor("M-0601", "Santos", "Maria", "C");
  loans.jose = await loanFor("M-0602", "Rizal", "José", "R");
  loans.ana1 = await loanFor("M-0603", "Reyes", "Ana");
  loans.ana2 = await loanFor("M-0604", "Reyes", "Ana");
  loans.pedro = await loanFor("M-0605", "Cruz", "Pedro");
  const created = await t.call("/deductions", { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { cutoffDate: "2026-09-15" } });
  assert.equal(created.status, 201, created.json.error);
  run = (await t.call(`/deductions/${created.json.run._id}/send`, { method: "POST", cookie: staff.signer.bookkeeper.cookie })).json.run;
});

after(async () => {
  if (uri) await t.close();
});

async function upload(buf, { name = "remittance-list.xlsx", type = XLSX, query = "" } = {}) {
  const res = await fetch(`${t.baseUrl}/deductions/${run._id}/remittance-file?name=${encodeURIComponent(name)}${query}`, {
    method: "POST",
    headers: { Cookie: staff.signer.bookkeeper.cookie, "Content-Type": type },
    body: buf,
  });
  return { status: res.status, json: await res.json() };
}

const lineOf = (loan) => run.lines.find((l) => l.loanNo === loan.loanNo);

test("header words: identifiers win over amounts, and names compare without initials or accents", () => {
  assert.equal(ri.classify("Employee No."), "employeeNo");
  assert.equal(ri.classify("Loan no."), "loanNo", "not the amount word 'loan'");
  assert.equal(ri.classify("UDEI No."), "memberNo");
  assert.equal(ri.classify("NAME"), "name");
  assert.equal(ri.classify("Mutual Assistance"), "amount");
  assert.equal(ri.classify("Total"), "amount");
  assert.equal(ri.classify("Ret. Plan"), null);
  assert.deepEqual(ri.nameWords("DELA CRUZ, Juan A. Jr.").sort(), ri.nameWords("Juan Dela Cruz").sort());
  assert.equal(ri.nameScore(ri.nameWords("RIZAL, JOSE R."), ri.nameWords("José R. Rizal")), 2);
  assert.equal(ri.nameScore(ri.nameWords("Reyes, Ana"), ri.nameWords("Ana Marie Reyes")), 1, "an extra given name");
  assert.equal(ri.nameScore(ri.nameWords("Reyes, Ana"), ri.nameWords("Ben Reyes")), 0);
});

test("the fixture list: matched by employee no. and by name, ambiguous, not found, and lines with no row", { skip }, async () => {
  assert.equal(run.status, "sent");
  const r = await upload(FIXTURE);
  assert.equal(r.status, 200, r.json.error);
  const p = r.json;
  assert.equal(p.sheet, "Remittance");
  assert.deepEqual(p.sheets.map((s) => [s.name, s.usable]), [["Remittance", true], ["Notes", false]]);
  assert.equal(p.headerRow, 5, "found below the title rows");
  assert.deepEqual(p.amountColumns, ["Mutual Assistance", "Total"], "Ret. Plan is not an amount to pick");
  assert.equal(p.amountColumn, "Mutual Assistance");
  assert.equal(p.pickAmountColumn, true, "two amount columns and nothing remembered");
  assert.equal(p.rows.length, 4, "the totals row is skipped");

  const row = (label) => p.rows.find((x) => x.label === label);
  const maria = row("SANTOS, MARIA C.");
  assert.deepEqual([maria.status, maria.by, maria.lineId, maria.amount], ["matched", "employee_no", lineOf(loans.maria)._id, 140_910]);
  const jose = row("RIZAL, JOSE R.");
  assert.deepEqual([jose.status, jose.by, jose.lineId], ["matched", "name", lineOf(loans.jose)._id], "accents and initials don't matter");
  const ana = row("REYES, ANA");
  assert.equal(ana.status, "ambiguous");
  assert.deepEqual(ana.candidates.map((c) => c.loanNo).sort(), [loans.ana1.loanNo, loans.ana2.loanNo].sort());
  assert.equal(ana.lineId, null, "the Bookkeeper picks one");
  assert.equal(row("DE LOS SANTOS, PABLO").status, "not_found");
  assert.deepEqual(p.counts, { matched: 2, ambiguous: 1, notFound: 1, badAmount: 0 });

  // Run lines with no row: Pedro, and both Anas until one is picked.
  const missing = p.missing.map((m) => [m.loanNo, m.maybe]).sort();
  assert.deepEqual(missing, [[loans.ana1.loanNo, true], [loans.ana2.loanNo, true], [loans.pedro.loanNo, false]].sort());

  // Nothing was saved: the run's lines still have remitted = expected.
  const after = (await t.call(`/deductions/${run._id}`, { cookie: staff.signer.bookkeeper.cookie })).json.run;
  assert.equal(after.lines.find((l) => l.loanNo === loans.jose.loanNo).remitted, lineOf(loans.jose).expected);
});

test("the amount column picker, remembered in Settings for the next upload", { skip }, async () => {
  const total = (await upload(FIXTURE, { query: "&amount=Total" })).json;
  assert.equal(total.amountColumn, "Total");
  assert.equal(total.rows.find((x) => x.label === "SANTOS, MARIA C.").amount, 190_910, "Mutual Assistance + Ret. Plan");

  const officer = await t.call("/deductions/import-settings", { method: "PUT", cookie: staff.officer.cookie, body: { mapping: { amount: "Total" } } });
  assert.equal(officer.status, 403);
  const saved = await t.call("/deductions/import-settings", { method: "PUT", cookie: staff.signer.bookkeeper.cookie, body: { sheet: "Remittance", mapping: total.mapping } });
  assert.equal(saved.status, 200, saved.json.error);
  const next = (await upload(FIXTURE)).json;
  assert.equal(next.amountColumn, "Total", "the remembered column");
  assert.equal(next.pickAmountColumn, false);
  assert.equal(next.remembered, true);
  await t.call("/deductions/import-settings", { method: "PUT", cookie: staff.signer.bookkeeper.cookie, body: { mapping: { amount: "Mutual Assistance" } } });
});

test("our own CSV format still reads, by loan no.; old .xls and lists without a header are refused", { skip }, async () => {
  const csv = `Member ID,Employee name,Loan no.,Loan type,Amount to deduct,Remitted\r\nM-0605,Pedro Cruz,${loans.pedro.loanNo},Long term,1409.10,1000.00\r\n`;
  const r = await upload(Buffer.from(csv), { name: "back.csv", type: "text/csv" });
  assert.equal(r.status, 200, r.json.error);
  assert.equal(r.json.amountColumn, "Remitted");
  assert.deepEqual(r.json.rows.map((x) => [x.status, x.by, x.amount]), [["matched", "loan_no", 100_000]]);
  // The old route keeps working too.
  const old = await t.call(`/deductions/${run._id}/import`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { csv } });
  assert.deepEqual(old.json.updates.map((u) => u.remitted), [100_000]);

  const xls = Buffer.concat([Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(64)]);
  const refused = await upload(xls, { name: "list.xls", type: "application/vnd.ms-excel" });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /save it as \.xlsx/);
  const noHeader = await upload(Buffer.from("a,b\r\n1,2\r\n"), { name: "x.csv", type: "text/csv" });
  assert.equal(noHeader.status, 400);
  assert.match(noHeader.json.error, /No header row/);
});
