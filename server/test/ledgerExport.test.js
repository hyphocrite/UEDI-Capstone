// The 1% service fee on payroll postings, and the Excel exports in UDEI's INDIV. LEDGER layout.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { uri, setup, application, staffUp, approve } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let loan;
const bk = () => staff.signer.bookkeeper.cookie;
const tr = () => staff.signer.treasurer.cookie;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  await t.call("/members", { method: "POST", cookie: staff.officer.cookie, body: { memberId: "M-0700", lastName: "Ledger", firstName: "Lara" } });
  const app = await approve(t, staff, application(0, { applicant: { memberId: "M-0700", lastName: "Ledger", firstName: "Lara" }, loan: { amount: 20000, termMonths: 12, paymentFrequency: "monthly" }, bookkeeper: { longTermBalance: 0, shortTermBalance: 0 } }));
  loan = (await t.call(`/loans/${app.loanId}/release`, { method: "POST", cookie: tr(), body: { releasedAt: "2026-08-01", voucherNo: "CV-LEDGER" } })).json.loan;
});

after(async () => {
  if (uri) await t.close();
});

async function workbook(path) {
  const res = await fetch(t.baseUrl + path, { headers: { Cookie: bk() } });
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(res.headers.get("content-type"), /spreadsheetml/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return { wb, disposition: res.headers.get("content-disposition") };
}

test("a payroll posting takes the 1% service fee; a cash payment doesn't", { skip }, async () => {
  // Payroll: the Sep 30 cutoff (monthly), remitted in full.
  const run = (await t.call("/deductions", { method: "POST", cookie: bk(), body: { cutoffDate: "2026-09-30" } })).json.run;
  await t.call(`/deductions/${run._id}/send`, { method: "POST", cookie: bk() });
  const line = run.lines.find((l) => l.loanNo === loan.loanNo);
  const remitted = line.expected;
  await t.call(`/deductions/${run._id}/remittance`, { method: "PUT", cookie: bk(), body: { remittance: { officialReceiptNo: "DNSC-0930", amountReceived: remitted, receivedAt: "2026-10-02" }, lines: [{ lineId: line._id, remitted }] } });
  const posted = await t.call(`/deductions/${run._id}/post`, { method: "POST", cookie: bk() });
  assert.equal(posted.status, 200, posted.json.error);
  assert.equal(posted.json.run.totals.remitted, remitted, "the run's totals stay gross");

  // Cash in October, through the Payments flow.
  const sub = (await t.call("/payments", { method: "POST", cookie: tr(), body: { loanId: loan._id, amount: 100_000, method: "cash", paidAt: "2026-10-05" } })).json.submission;
  await t.call(`/payments/${sub._id}/receive`, { method: "POST", cookie: tr(), body: { orNumber: "OR-7001", receivedAt: "2026-10-05" } });
  assert.equal((await t.call(`/payments/${sub._id}/confirm`, { method: "POST", cookie: bk() })).status, 200);

  const { payments } = (await t.call(`/loans/${loan._id}`, { cookie: bk() })).json;
  const payroll = payments.find((p) => p.method === "payroll");
  const fee = Math.floor(remitted / 100 + 0.5);
  assert.deepEqual([payroll.grossAmount, payroll.serviceFee, payroll.amount], [remitted, fee, remitted - fee]);
  const cash = payments.find((p) => p.method === "cash");
  assert.deepEqual([cash.grossAmount, cash.serviceFee, cash.amount], [100_000, 0, 100_000]);

  const report = (await t.call("/reports?period=monthly", { cookie: tr() })).json;
  const rows = report.rows ?? report.report?.rows ?? [];
  assert.equal(rows.reduce((s, r) => s + (r.serviceFees || 0), 0), fee, "Service fees collected");
});

test("the individual ledger workbook: headers, one member block, Balance falls by Net Pay", { skip }, async () => {
  const officer = await fetch(`${t.baseUrl}/loans/ledger.xlsx?year=2026`, { headers: { Cookie: staff.officer.cookie } });
  assert.equal(officer.status, 403, "Bookkeeper, Treasurer and up");

  const { wb, disposition } = await workbook("/loans/ledger.xlsx?year=2026");
  assert.match(disposition, /UDEI-Individual-Ledger-2026\.xlsx/);
  const ws = wb.getWorksheet("INDIV. LEDGER");
  assert.equal(ws.getCell("A1").value, "UNITED DNSC EMPLOYEES, INC");
  assert.equal(ws.getCell("A2").value, "Mutual Assistance Receivable Individual Ledger");
  assert.equal(ws.getCell("A3").value, "2026");
  assert.deepEqual(["A", "D", "E", "F", "G", "H", "I", "J"].map((c) => ws.getCell(`${c}4`).value), ["Date", "Payment", "1% SF", "Net Pay", "Interest", "Accrued", "Principal", "Balance"]);
  assert.ok(ws.getCell("A1").isMerged, "merged title");

  const rowOf = (label) => {
    for (let r = 5; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === label) return r;
    return -1;
  };
  const name = rowOf("Name:");
  assert.equal(ws.getCell(name, 2).value, "UDEI No. M-0700");
  assert.equal(ws.getCell(name + 1, 1).value, "January (Beg)");
  assert.equal(ws.getCell(name + 1, 10).value, 0, "released in August: nothing at the start of the year");
  const v = (r, c) => Math.round((ws.getCell(r, c).value || 0) * 100);
  const aug = rowOf("August");
  const sep = rowOf("September");
  const oct = rowOf("October");
  assert.equal(v(aug, 10), loan.totalPayable, "the release raises the balance in August");

  const payroll = { pay: v(sep, 4), fee: v(sep, 5), net: v(sep, 6) };
  assert.ok(payroll.fee > 0, "a payroll month with the service fee");
  assert.equal(payroll.pay - payroll.fee, payroll.net);
  assert.equal(v(sep, 7) + v(sep, 9), payroll.net, "interest + principal = net pay");
  assert.equal(v(sep, 10), v(aug, 10) - payroll.net, "Balance falls by Net Pay, not by Payment");
  assert.deepEqual([v(oct, 4), v(oct, 5), v(oct, 6)], [100_000, 0, 100_000], "a cash month without the fee");
  assert.equal(ws.getCell(oct, 3).value, "OR OR-7001");
  assert.equal(v(oct, 10), v(sep, 10) - 100_000);

  const total = rowOf("TOTAL");
  assert.equal(v(total, 4), payroll.pay + 100_000);
  assert.equal(v(total, 5), payroll.fee);
  assert.equal(v(total, 10), v(rowOf("December"), 10), "TOTAL carries the closing balance");
  assert.equal(ws.getCell(name + 1, 10).numFmt, "#,##0.00");

  const one = await workbook("/loans/ledger.xlsx?year=2026&memberId=M-0700");
  assert.match(one.disposition, /UDEI-Individual-Ledger-2026-M-0700\.xlsx/);
});

test("the payments export has the month's cash payments and a Payroll sheet, with totals", { skip }, async () => {
  const oct = (await workbook("/payments/export.xlsx?month=2026-10")).wb;
  const ws = oct.getWorksheet("Payments");
  assert.deepEqual(ws.getRow(3).values.slice(1, 11), ["Date", "UDEI no.", "Borrower", "MA no.", "Mode of payment", "Reference", "OR no.", "Amount", "Received by (Treasurer)", "Confirmed by (Bookkeeper)"]);
  assert.deepEqual(ws.getRow(4).values.slice(1, 8), ["2026-10-05", "M-0700", "Lara C. Ledger", loan.loanNo, "Cash (over the counter)", "", "OR-7001"]);
  assert.deepEqual([ws.getRow(5).getCell(1).value, ws.getRow(5).getCell(8).value], ["TOTAL", 1000]);
  assert.deepEqual([ws.getCell("I4").value, ws.getCell("J4").value], ["Test treasurer", "Test bookkeeper"]);

  const sep = (await workbook("/payments/export.xlsx?month=2026-09")).wb.getWorksheet("Payroll");
  const row = sep.getRow(4);
  assert.equal(row.getCell(5).value, "Payroll 2026-09-30");
  assert.equal(Math.round((row.getCell(6).value - row.getCell(7).value) * 100), Math.round(row.getCell(8).value * 100), "Payment - SF = Net Pay");
  assert.equal(sep.getRow(5).getCell(1).value, "TOTAL");
  assert.equal((await t.call("/payments/export.xlsx?month=bad", { cookie: bk() })).status, 400);
});
