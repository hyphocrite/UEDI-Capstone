// Unit tests for payroll deduction math and CSV (no database needed).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../src/services/deductions");
const ledger = require("../src/services/ledger");

const key = (x) => d.dayKey(x);

test("cutoffs are the 15th and the month-end, including February and leap years", () => {
  for (const ok of ["2026-10-15", "2026-10-31", "2026-11-30", "2027-02-28", "2028-02-29", "2026-02-28", "2026-12-31"]) assert.ok(d.isCutoff(ok), ok);
  for (const no of ["2026-10-14", "2026-10-30", "2028-02-28", "2026-02-27", "2026-11-01"]) assert.equal(d.isCutoff(no), false, no);

  assert.equal(key(d.cutoffOnOrAfter("2027-02-16")), "2027-02-28");
  assert.equal(key(d.cutoffOnOrAfter("2028-02-16")), "2028-02-29");
  assert.equal(key(d.cutoffOnOrAfter("2026-10-15")), "2026-10-15");
  assert.equal(key(d.cutoffOnOrBefore("2026-10-14")), "2026-09-30");
  assert.equal(key(d.cutoffOnOrBefore("2026-03-01")), "2026-02-28");
  assert.equal(key(d.cutoffOnOrBefore("2026-01-10")), "2025-12-31");
  assert.equal(key(d.nextCutoff("2026-12-31")), "2027-01-15");
  assert.equal(key(d.nextCutoff("2028-02-15")), "2028-02-29");

  // A Manila evening is still the same calendar day; the cutoff doesn't drift to the next day.
  assert.equal(key(ledger.todayInManila(new Date("2026-10-31T15:30:00Z"))), "2026-10-31");
  assert.ok(d.isCutoff(ledger.todayInManila(new Date("2026-10-31T15:30:00Z"))));

  assert.equal(key(d.suggestCutoff("2026-10-19", [])), "2026-10-15");
  assert.equal(key(d.suggestCutoff("2026-10-19", [new Date("2026-10-15T00:00:00Z")])), "2026-10-31");
});

const loan = (over) => {
  const base = { _id: over.loanNo, status: "active", memberId: "M-1", borrowerName: "Santos, Maria", loanType: "long_term", principal: 6_000_000, monthlyRate: 1, termMonths: 24, paymentFrequency: "quincenal", ...over };
  return { ...base, schedule: ledger.buildSchedule({ ...base, releasedAt: "2026-08-01" }) };
};

test("quincenal loans are on both cutoffs, monthly loans only at month-end; expected and arrears", () => {
  const q = loan({ loanNo: "MA-1", borrowerName: "Zamora, Ben" });
  const m = loan({ loanNo: "MA-2", borrowerName: "Abad, Cora", loanType: "emergency", principal: 1_000_000, monthlyRate: 1.5, termMonths: 6, paymentFrequency: "monthly" });
  // q: due Aug 15, Aug 31, Sep 15, Sep 30 … ₱1,409.10 each. m: due Aug 31, Sep 30 … ₱1,755.25 each.
  const mid = d.buildLines([q, m], "2026-09-15");
  assert.deepEqual(mid.map((l) => l.loanNo), ["MA-1"], "monthly loans skip the 15th");
  assert.equal(mid[0].expected, 140_910);
  assert.equal(mid[0].arrears, 281_820, "Aug 15 and Aug 31 unpaid");

  const end = d.buildLines([q, m], "2026-09-30");
  assert.deepEqual(end.map((l) => l.loanNo), ["MA-2", "MA-1"], "sorted by borrower name");
  assert.equal(end[0].expected, 175_525);
  assert.equal(end[0].arrears, 175_525);

  // Paid up to and including half of Sep 15: expected is the unpaid part, arrears are zero.
  const { schedule } = ledger.allocate(q.schedule, [{ amount: 140_910 * 2 + 50_000 }]);
  const partly = d.amountsFor(schedule, "2026-09-15");
  assert.deepEqual(partly, { expected: 90_910, arrears: 0 });
  assert.equal(d.amountsFor(q.schedule, "2026-09-14"), null, "nothing due that day");

  const separated = d.buildLines([{ ...q, collectFrom: { source: "final_pay" } }], "2026-09-15")[0];
  assert.equal(separated.expected, 0, "payroll won't deduct from a separated member");
  assert.equal(separated.reason, "separated");
  assert.equal(separated.arrears, 422_730);
  assert.equal(d.buildLines([{ ...q, status: "paid" }], "2026-09-15").length, 0);
});

test("CSV round trip keeps names with commas and quotes, with a totals row", () => {
  const lines = [
    { _id: "a", loanNo: "MA-2026-0001", memberId: "M-0003", borrowerName: 'Ana "Annie" Dela Cruz, Jr.', loanType: "long_term", expected: 155_000 },
    { _id: "b", loanNo: "MA-2026-0002", memberId: "", borrowerName: "=HYPERLINK(evil)", loanType: "emergency", expected: 181_666 },
    { _id: "c", loanNo: "MA-2026-0003", memberId: "M-9", borrowerName: "Removed Person", loanType: "emergency", expected: 1, removed: true },
  ];
  const csv = d.deductionListCsv(lines);
  assert.match(csv, /"Ana ""Annie"" Dela Cruz, Jr\."/);
  assert.match(csv, /'=HYPERLINK\(evil\)/, "formula text is defused for spreadsheets");
  assert.doesNotMatch(csv, /Removed Person/);
  const rows = d.parseCsv(csv);
  assert.deepEqual(rows[0], ["Member ID", "Employee name", "Loan no.", "Loan type", "Amount to deduct"]);
  assert.deepEqual(rows[1], ["M-0003", 'Ana "Annie" Dela Cruz, Jr.', "MA-2026-0001", "Long term", "1550.00"]);
  assert.equal(rows[2][1], "=HYPERLINK(evil)", "parsing undoes the guard");
  assert.deepEqual(rows[3], ["", "TOTAL", "2 loans", "", "3366.66"]);

  // The Payroll Officer's file comes back with a Remitted column.
  const back = d.toCsv([[...rows[0], "Remitted"], [...rows[1], "1,550.00"], [...rows[2], "₱0"], ["M-7", "Stranger, X", "MA-2099-0001", "Long term", "100.00", "100.00"], [...rows[2], "5"], [...rows[3], "1550.00"]]);
  const { updates, problems } = d.parseRemittedCsv(back, lines);
  assert.deepEqual(updates.map((u) => [u.loanNo, u.remitted]), [["MA-2026-0001", 155_000], ["MA-2026-0002", 0]]);
  assert.deepEqual(problems.map((p) => p.loanNo), ["MA-2099-0001", "MA-2026-0002"], "unmatched and duplicate rows are reported");
  assert.match(d.parseRemittedCsv("a,b\n1,2", lines).problems[0].message, /No header row/);

  assert.equal(d.parseAmount("1,234.56"), 123_456);
  assert.equal(d.parseAmount("₱ 1234.5"), 123_450);
  assert.ok(Number.isNaN(d.parseAmount("12.345")));
  assert.ok(Number.isNaN(d.parseAmount("-5")));
  assert.deepEqual(d.parseCsv('x,"a\r\nb"\r\n'), [["x", "a\r\nb"]], "line breaks inside quotes");
});

test("results and remittance checks", () => {
  assert.equal(d.resultFor({ expected: 100, remitted: 100 }), "full");
  assert.equal(d.resultFor({ expected: 100, remitted: 150 }), "full");
  assert.equal(d.resultFor({ expected: 100, remitted: 40 }), "partial");
  assert.equal(d.resultFor({ expected: 100, remitted: 0 }), "missed");
  assert.equal(d.resultFor({ expected: 0, remitted: 0, reason: "separated" }), "missed");

  const lines = [
    { loan: "1", loanNo: "MA-1", expected: 100, remitted: 0 },
    { loan: "2", loanNo: "MA-2", expected: 100, remitted: 50, reason: "other" },
    { loan: "3", loanNo: "MA-3", expected: 100, remitted: 900 },
    { loan: "4", loanNo: "MA-4", expected: 100, remitted: 0, reason: "lwop" },
    { loan: "5", loanNo: "MA-5", expected: 100, remitted: 0, removed: true },
  ];
  const problems = d.remittanceProblems(lines, new Map([["3", 500]]));
  assert.equal(problems.length, 3);
  assert.match(problems[0], /MA-1: less than expected/);
  assert.match(problems[1], /MA-2: describe the reason/);
  assert.match(problems[2], /MA-3: ₱9\.00 is more than the remaining balance of ₱5\.00/);

  const t = d.totals([{ memberId: "M-1", expected: 100, remitted: 0, reason: "lwop" }, { memberId: "M-1", expected: 50, remitted: 50 }, { memberId: "M-2", expected: 10, remitted: 5, reason: "other" }]);
  assert.deepEqual(t, { members: 2, lines: 3, expected: 160, arrears: 0, remitted: 55, missed: 1, partial: 1 });
});
