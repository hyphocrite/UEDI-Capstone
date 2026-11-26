// Excel exports in UDEI's own formats (exceljs).
//
// individualLedger(): the "INDIV. LEDGER" sheet of UDEI's UDEI LOANS workbook (the same layout
// scripts/import-udei.js reads): rows 1-3 the title (merged A:J), row 4 the headers, then one block
// per member: "Name:" | "UDEI No. N" (status in D), "January (Beg)" with the opening balance in J,
// one row per month, and "TOTAL", with a blank row between blocks. As in UDEI's sheet, the balance
// goes down by Net Pay (the payment less the 1% service fee), not by the gross payment.
//
// paymentsWorkbook(): one month's posted cash, e-money and bank payments, and a "Payroll" sheet
// with that month's payroll deductions, for the Bookkeeper's monthly file.
const ExcelJS = require("exceljs");
const Loan = require("../models/Loan");
const Member = require("../models/Member");
const Payment = require("../models/Payment");
const PaymentSubmission = require("../models/PaymentSubmission");
const DeductionRun = require("../models/DeductionRun");
const ledger = require("./ledger");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PESO = "#,##0.00";
const pesos = (c) => Math.round(c) / 100;
const gross = (p) => p.grossAmount ?? p.amount + (p.serviceFee || 0);

/**
 * How each payment splits into interest and principal, allocating payments oldest first onto the
 * schedule like ledger.allocate (interest before principal within an installment).
 */
function splitPayments(schedule, payments) {
  const left = schedule.map((x) => ({ interest: x.interestDue, principal: x.principalDue }));
  let i = 0;
  return payments.map((p) => {
    let rest = p.amount;
    let interest = 0;
    let principal = 0;
    while (rest > 0 && i < left.length) {
      const a = Math.min(rest, left[i].interest);
      left[i].interest -= a;
      interest += a;
      rest -= a;
      const b = Math.min(rest, left[i].principal);
      left[i].principal -= b;
      principal += b;
      rest -= b;
      if (left[i].interest === 0 && left[i].principal === 0) i += 1;
    }
    return { interest, principal };
  });
}

/** One member's year: opening balance, the twelve months and the closing balance. Centavos. */
function memberYear(loans, paymentsByLoan, year) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const months = MONTHS.map(() => ({ payment: 0, fee: 0, net: 0, interest: 0, principal: 0, released: 0, refs: [] }));
  let opening = 0;
  for (const loan of loans) {
    const total = ledger.totalPayable(loan.schedule);
    const pays = (paymentsByLoan.get(String(loan._id)) || []).sort((a, b) => a.paidAt - b.paidAt || a.createdAt - b.createdAt);
    const split = splitPayments(loan.schedule, pays);
    const released = new Date(loan.release?.releasedAt ?? loan.createdAt).getTime();
    if (released < start) opening += total - pays.filter((p) => p.paidAt.getTime() < start).reduce((s, p) => s + p.amount, 0);
    else if (released < end) months[new Date(released).getUTCMonth()].released += total;
    pays.forEach((p, k) => {
      const t = p.paidAt.getTime();
      if (t < start || t >= end) return;
      const m = months[p.paidAt.getUTCMonth()];
      m.payment += gross(p);
      m.fee += p.serviceFee || 0;
      m.net += p.amount;
      m.interest += split[k].interest;
      m.principal += split[k].principal;
      if (p.orNumber) m.refs.push(`OR ${p.orNumber}`);
    });
  }
  let balance = opening;
  for (const m of months) {
    balance += m.released - m.net;
    m.balance = balance;
  }
  return { opening, months, closing: balance };
}

function titleRows(ws, title, subtitle) {
  ws.columns = [{ width: 18 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 13 }, { width: 11 }, { width: 14 }, { width: 15 }];
  [["UNITED DNSC EMPLOYEES, INC", 14], [title, 12], [subtitle, 12]].forEach(([text, size], i) => {
    const r = i + 1;
    ws.mergeCells(r, 1, r, 10);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { bold: true, size };
    c.alignment = { horizontal: "center" };
  });
}

/** The INDIV. LEDGER workbook for a year, optionally for one member. */
async function individualLedger(year, { memberId } = {}) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const filter = {
    memberId: memberId ? memberId : { $exists: true, $ne: null },
    status: { $in: ["active", "paid"] },
    "release.releasedAt": { $lt: end },
    $or: [{ paidOffAt: { $exists: false } }, { paidOffAt: null }, { paidOffAt: { $gte: start } }],
  };
  const loans = await Loan.find(filter).lean();
  const payments = await Payment.find({ loan: { $in: loans.map((l) => l._id) }, voided: false, paidAt: { $lt: end } }).lean();
  const byLoan = new Map();
  for (const p of payments) byLoan.set(String(p.loan), [...(byLoan.get(String(p.loan)) || []), p]);
  const ids = [...new Set(loans.map((l) => l.memberId))].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const members = new Map((await Member.find({ memberId: { $in: ids } }).select("memberId fullName remarks").lean()).map((m) => [m.memberId, m]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "UDEI Mutual Assistance system";
  const ws = wb.addWorksheet("INDIV. LEDGER");
  titleRows(ws, "Mutual Assistance Receivable Individual Ledger", String(year));
  const header = ws.getRow(4);
  [["A", "Date"], ["C", "DV# / OR#"], ["D", "Payment"], ["E", "1% SF"], ["F", "Net Pay"], ["G", "Interest"], ["H", "Accrued"], ["I", "Principal"], ["J", "Balance"]].forEach(([col, text]) => {
    const c = ws.getCell(`${col}4`);
    c.value = text;
    c.font = { bold: true };
    c.alignment = { horizontal: col === "A" ? "left" : "center" };
    c.border = { bottom: { style: "thin" } };
  });
  header.commit();

  let r = 5;
  const money = (row, col, centavos) => {
    const c = ws.getCell(row, col);
    c.value = pesos(centavos);
    c.numFmt = PESO;
  };
  for (const id of ids) {
    const mine = loans.filter((l) => l.memberId === id);
    const y = memberYear(mine, byLoan, year);
    const member = members.get(id);
    const status = /amnesty/i.test(member?.remarks || "")
      ? "On Amnesty"
      : mine.some((l) => l.conversions?.length)
        ? "Converted to long term"
        : mine.every((l) => l.status === "paid") && y.closing <= 0
          ? "Paid"
          : null;
    ws.getCell(r, 1).value = "Name:";
    ws.getCell(r, 2).value = `UDEI No. ${id}`;
    ws.getCell(r, 3).value = member?.fullName || mine[0].borrowerName;
    if (status) ws.getCell(r, 4).value = status;
    ws.getRow(r).font = { bold: true };
    r += 1;
    ws.getCell(r, 1).value = "January (Beg)";
    money(r, 10, y.opening);
    r += 1;
    y.months.forEach((m, i) => {
      ws.getCell(r, 1).value = MONTHS[i];
      if (m.refs.length) ws.getCell(r, 3).value = m.refs.join(", ");
      if (m.payment) {
        money(r, 4, m.payment);
        money(r, 5, m.fee);
        money(r, 6, m.net);
        money(r, 7, m.interest);
        money(r, 9, m.principal);
      }
      // TODO: UDEI's sheet has an Accrued column (H) but no formula for it yet; left empty.
      money(r, 10, m.balance);
      r += 1;
    });
    ws.getCell(r, 1).value = "TOTAL";
    const sum = (k) => y.months.reduce((s, m) => s + m[k], 0);
    money(r, 4, sum("payment"));
    money(r, 5, sum("fee"));
    money(r, 6, sum("net"));
    money(r, 7, sum("interest"));
    money(r, 9, sum("principal"));
    money(r, 10, y.closing);
    ws.getRow(r).font = { bold: true };
    r += 2; // a blank row between members
  }
  return wb;
}

/** One month's posted cash, e-money and bank payments, and a Payroll sheet with that month's payroll deductions. */
async function paymentsWorkbook(month) {
  const [y, m] = month.split("-").map(Number);
  const range = { $gte: new Date(Date.UTC(y, m - 1, 1)), $lt: new Date(Date.UTC(y, m, 1)) };
  const label = `${MONTHS[m - 1]} ${y}`;
  const subs = await PaymentSubmission.find({ status: "posted", paidAt: range }).sort({ paidAt: 1 }).lean();
  const posted = await Payment.find({ _id: { $in: subs.map((s) => s.payment).filter(Boolean) } }).lean();
  const payOf = new Map(posted.map((p) => [String(p._id), p]));
  const payroll = await Payment.find({ method: "payroll", voided: false, paidAt: range }).sort({ paidAt: 1 }).lean();
  const loans = new Map((await Loan.find({ _id: { $in: payroll.map((p) => p.loan) } }).select("loanNo borrowerName memberId").lean()).map((l) => [String(l._id), l]));
  const runs = new Map((await DeductionRun.find({ _id: { $in: payroll.map((p) => p.deductionRun).filter(Boolean) } }).select("cutoffDate kind bonusType").lean()).map((r) => [String(r._id), r]));
  const METHOD = { cash: "Cash", e_money: "E-money", bank_transfer: "Bank transfer" };
  const day = (d) => ledger.calendarDay(d).toISOString().slice(0, 10);

  const wb = new ExcelJS.Workbook();
  wb.creator = "UDEI Mutual Assistance system";
  const table = (ws, headers, rows, moneyCols, widths) => {
    ws.columns = widths.map((width) => ({ width }));
    const h = ws.addRow(headers);
    h.font = { bold: true };
    h.eachCell((c) => (c.border = { bottom: { style: "thin" } }));
    for (const row of rows) {
      const added = ws.addRow(row);
      for (const col of moneyCols) added.getCell(col).numFmt = PESO;
    }
    const total = ws.addRow(headers.map((_, i) => (i === 0 ? "TOTAL" : moneyCols.includes(i + 1) ? rows.reduce((s, row) => s + (row[i] || 0), 0) : null)));
    total.font = { bold: true };
    for (const col of moneyCols) total.getCell(col).numFmt = PESO;
    return total;
  };

  const ws = wb.addWorksheet("Payments");
  ws.addRow([`Payments outside payroll, ${label}`]).font = { bold: true, size: 12 };
  ws.addRow([]);
  table(
    ws,
    ["Date", "UDEI No.", "Borrower", "MA no.", "Method", "Reference", "OR No.", "Amount", "Received by (Treasurer)", "Confirmed by (Bookkeeper)"],
    subs.map((s) => [day(s.paidAt), s.memberId || "", s.borrowerName, s.loanNo, METHOD[s.method] || s.method, s.reference || "", s.received?.orNumber || "", pesos(gross(payOf.get(String(s.payment)) || { amount: s.amount })), s.received?.byName || "", s.confirmed?.byName || ""]),
    [8],
    [12, 10, 26, 15, 14, 22, 12, 13, 24, 24],
  );

  const pr = wb.addWorksheet("Payroll");
  pr.addRow([`Payroll deductions posted, ${label}`]).font = { bold: true, size: 12 };
  pr.addRow([]);
  table(
    pr,
    ["Date", "UDEI No.", "Borrower", "MA no.", "Run", "Payment", "1% SF", "Net Pay"],
    payroll.map((p) => {
      const l = loans.get(String(p.loan)) || {};
      const run = runs.get(String(p.deductionRun));
      return [day(p.paidAt), l.memberId || "", l.borrowerName || "", l.loanNo || "", run ? (run.kind === "bonus" ? `Bonus run ${day(run.cutoffDate)}` : `Payroll ${day(run.cutoffDate)}`) : p.reference || "", pesos(gross(p)), pesos(p.serviceFee || 0), pesos(p.amount)];
    }),
    [6, 7, 8],
    [12, 10, 26, 15, 22, 13, 10, 13],
  );
  return wb;
}

module.exports = { individualLedger, paymentsWorkbook, memberYear, splitPayments, MONTHS };
