// Payroll deduction runs: cutoff dates, what to deduct per loan, the CSV for DNSC's Payroll
// Officer, and checking what payroll remitted. Plain functions, no Express or Mongoose.
// Amounts are integer centavos. Dates are calendar days at UTC midnight (see ledger.js), so a
// cutoff on the 15th or the month-end never shifts a day; "today" is the date in Manila.
const ledger = require("./ledger");

const REASONS = ["lwop", "separated", "insufficient_pay", "not_in_payroll", "other"];
const REASON_LABELS = {
  lwop: "Leave without pay",
  separated: "Separated from DNSC",
  insufficient_pay: "Insufficient pay",
  not_in_payroll: "Not in payroll",
  other: "Other",
};

const DAY_MS = 86_400_000;
const dayKey = (d) => ledger.calendarDay(d).toISOString().slice(0, 10);
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// ---- Cutoff dates -------------------------------------------------------------------------

/** True for the 15th and the last day of a month (28th/29th in February). */
function isCutoff(date) {
  const d = ledger.calendarDay(date);
  const day = d.getUTCDate();
  return day === 15 || day === lastDay(d.getUTCFullYear(), d.getUTCMonth());
}

/** The first cutoff on or after `date`. */
function cutoffOnOrAfter(date) {
  const d = ledger.calendarDay(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (d.getUTCDate() <= 15) return new Date(Date.UTC(y, m, 15));
  return new Date(Date.UTC(y, m, lastDay(y, m)));
}

/** The last cutoff on or before `date`. */
function cutoffOnOrBefore(date) {
  const d = ledger.calendarDay(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (d.getUTCDate() === lastDay(y, m)) return d;
  if (d.getUTCDate() >= 15) return new Date(Date.UTC(y, m, 15));
  return new Date(Date.UTC(y, m, 0)); // last day of the previous month
}

const nextCutoff = (cutoff) => cutoffOnOrAfter(new Date(ledger.calendarDay(cutoff).getTime() + DAY_MS));

/**
 * The cutoff the "New run" button suggests: starting from the latest cutoff on or before today,
 * the first one that has no run yet.
 */
function suggestCutoff(today, existing) {
  const taken = new Set([...existing].map(dayKey));
  let c = cutoffOnOrBefore(today);
  for (let i = 0; i < 48 && taken.has(dayKey(c)); i++) c = nextCutoff(c);
  return c;
}

// ---- Lines ---------------------------------------------------------------------------------

const unpaid = (x) => x.totalDue - x.paid;

/**
 * What one loan owes on a cutoff: `expected` is the unpaid part of the installment(s) due on that
 * date, `arrears` what is still unpaid from earlier due dates. Arrears are shown, not added, because
 * payroll deducts a fixed amount. Null when nothing falls due on the cutoff.
 */
function amountsFor(schedule, cutoff) {
  const t = ledger.calendarDay(cutoff).getTime();
  const at = (x) => ledger.calendarDay(x.dueDate).getTime();
  const due = schedule.filter((x) => at(x) === t);
  if (due.length === 0) return null;
  return {
    expected: due.reduce((s, x) => s + unpaid(x), 0),
    arrears: schedule.filter((x) => at(x) < t).reduce((s, x) => s + unpaid(x), 0),
  };
}

/**
 * The run's lines: every active loan with an installment due on the cutoff (quincenal loans on both
 * cutoffs, monthly loans only at month-end), sorted by borrower name. Loans flagged for collection
 * from final pay stay listed with nothing to deduct, because payroll won't deduct again.
 */
function buildLines(loans, cutoff) {
  const lines = [];
  for (const loan of loans) {
    if (loan.status !== "active") continue;
    const amounts = amountsFor(loan.schedule, cutoff);
    if (!amounts) continue;
    const separated = loan.collectFrom?.source === "final_pay";
    lines.push({
      loan: loan._id,
      loanNo: loan.loanNo,
      memberId: loan.memberId,
      borrowerName: loan.borrowerName,
      loanType: loan.loanType,
      expected: separated ? 0 : amounts.expected,
      arrears: amounts.arrears + (separated ? amounts.expected : 0),
      ...(separated ? { reason: "separated", reasonNote: "Carried over: collect from final pay or retirement plan." } : {}),
    });
  }
  return lines.sort((a, b) => a.borrowerName.localeCompare(b.borrowerName, "en") || a.loanNo.localeCompare(b.loanNo));
}

const activeLines = (lines) => lines.filter((l) => !l.removed);

/** full when payroll deducted at least the expected amount, partial when some, missed when none. */
function resultFor({ expected, remitted, reason }) {
  if (remitted === 0 && (expected > 0 || reason)) return "missed";
  if (remitted < expected) return "partial";
  return "full";
}

function totals(lines) {
  const live = activeLines(lines);
  const sum = (k) => live.reduce((s, l) => s + (l[k] || 0), 0);
  const results = live.map((l) => (l.remitted === undefined || l.remitted === null ? null : resultFor(l)));
  return {
    members: new Set(live.map((l) => l.memberId || l.borrowerName)).size,
    lines: live.length,
    expected: sum("expected"),
    arrears: sum("arrears"),
    remitted: sum("remitted"),
    missed: results.filter((r) => r === "missed").length,
    partial: results.filter((r) => r === "partial").length,
  };
}

/**
 * Problems with the remitted amounts, as messages naming the loan. `balances` maps loan id to its
 * remaining balance: more than the expected amount is fine (it goes to the next installments), more
 * than the balance is not.
 */
function remittanceProblems(lines, balances) {
  const problems = [];
  for (const l of activeLines(lines)) {
    const r = l.remitted;
    if (!Number.isInteger(r) || r < 0) {
      problems.push(`${l.loanNo}: enter the amount deducted.`);
      continue;
    }
    if (r < l.expected && !l.reason) problems.push(`${l.loanNo}: less than expected was deducted; give a reason.`);
    if (l.reason && !REASONS.includes(l.reason)) problems.push(`${l.loanNo}: unknown reason.`);
    if (l.reason === "other" && !l.reasonNote?.trim()) problems.push(`${l.loanNo}: describe the reason.`);
    const balance = balances.get(String(l.loan));
    if (balance !== undefined && r > balance) {
      problems.push(`${l.loanNo}: ${peso(r)} is more than the remaining balance of ${peso(balance)}.`);
    }
  }
  return problems;
}

// ---- CSV ---------------------------------------------------------------------------------

const peso = (c) => `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Amount for a CSV cell: 1234.56, no currency sign or thousands separator. */
const csvAmount = (c) => (c / 100).toFixed(2);
const LOAN_TYPE_LABELS = { long_term: "Long term", emergency: "Emergency" };
const HEADER = ["Member ID", "Employee name", "Loan no.", "Loan type", "Amount to deduct"];

/** One CSV cell: quoted when it holds a comma, quote or line break; formula-looking text is defused for spreadsheets. */
function csvCell(value) {
  let s = value === undefined || value === null ? "" : String(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** The deduction list for DNSC's Payroll Officer, with a totals row. withRemitted adds a "Remitted" column. */
function deductionListCsv(lines, { withRemitted = false } = {}) {
  const live = activeLines(lines);
  const rows = [withRemitted ? [...HEADER, "Remitted"] : HEADER];
  for (const l of live) {
    const row = [l.memberId || "", l.borrowerName, l.loanNo, LOAN_TYPE_LABELS[l.loanType] || l.loanType, csvAmount(l.expected)];
    rows.push(withRemitted ? [...row, csvAmount(l.remitted ?? l.expected)] : row);
  }
  const total = ["", "TOTAL", `${live.length} loans`, "", csvAmount(live.reduce((s, l) => s + l.expected, 0))];
  rows.push(withRemitted ? [...total, csvAmount(live.reduce((s, l) => s + (l.remitted ?? l.expected), 0))] : total);
  return toCsv(rows);
}

/** Parses CSV text (RFC 4180: quoted cells, doubled quotes, CRLF or LF, optional BOM) into rows of cells. */
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Undo the spreadsheet-formula guard added by csvCell.
  return rows.map((r) => r.map((c) => (/^'[=+@\t\r]/.test(c) ? c.slice(1) : c)));
}

/** "1,234.56", "₱1234.5" or "1234" to centavos; NaN when it isn't an amount. */
function parseAmount(text) {
  const s = String(text ?? "").replace(/[₱,\s]/g, "").replace(/^PHP/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

/**
 * Reads remitted amounts from a CSV in the deduction-list layout plus a "Remitted" column, matched
 * by loan number. Rows that don't match a line are reported, not guessed.
 */
function parseRemittedCsv(text, lines) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  const norm = (s) => s.trim().toLowerCase().replace(/\.$/, "");
  const headerAt = rows.findIndex((r) => r.some((c) => norm(c) === "loan no") && r.some((c) => norm(c) === "remitted"));
  if (headerAt < 0) return { updates: [], problems: [{ row: 1, message: 'No header row with "Loan no." and "Remitted" columns.' }] };
  const header = rows[headerAt].map(norm);
  const loanCol = header.indexOf("loan no");
  const remittedCol = header.indexOf("remitted");
  const byLoanNo = new Map(activeLines(lines).map((l) => [l.loanNo.toUpperCase(), l]));

  const updates = [];
  const problems = [];
  const seen = new Set();
  rows.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2;
    const loanNo = (r[loanCol] ?? "").trim();
    if (!loanNo || r.some((c) => norm(c) === "total")) return; // totals row
    const line = byLoanNo.get(loanNo.toUpperCase());
    if (!line) return problems.push({ row: rowNo, loanNo, message: `${loanNo} is not on this run.` });
    if (seen.has(line.loanNo)) return problems.push({ row: rowNo, loanNo, message: `${loanNo} appears more than once.` });
    const amount = parseAmount(r[remittedCol]);
    if (Number.isNaN(amount)) return problems.push({ row: rowNo, loanNo, message: `"${r[remittedCol] ?? ""}" is not an amount.` });
    seen.add(line.loanNo);
    updates.push({ lineId: line._id ? String(line._id) : undefined, loanNo: line.loanNo, remitted: amount });
  });
  return { updates, problems };
}

module.exports = {
  REASONS,
  REASON_LABELS,
  isCutoff,
  cutoffOnOrAfter,
  cutoffOnOrBefore,
  nextCutoff,
  suggestCutoff,
  amountsFor,
  buildLines,
  activeLines,
  resultFor,
  totals,
  remittanceProblems,
  csvCell,
  toCsv,
  deductionListCsv,
  parseCsv,
  parseAmount,
  parseRemittedCsv,
  dayKey,
};
