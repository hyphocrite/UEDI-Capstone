// Unit tests for the loan math (no database needed).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ledger = require("../src/services/ledger");

const iso = (d) => d.toISOString().slice(0, 10);
const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0);

test("schedule adds up exactly to principal + add-on interest, for both frequencies", () => {
  const cases = [
    { principal: 6_000_000, monthlyRate: 1, termMonths: 24, paymentFrequency: "quincenal" },
    { principal: 6_000_000, monthlyRate: 1, termMonths: 24, paymentFrequency: "monthly" },
    { principal: 1_234_567, monthlyRate: 1.5, termMonths: 7, paymentFrequency: "quincenal" },
    { principal: 1_234_567, monthlyRate: 1.5, termMonths: 7, paymentFrequency: "monthly" },
    { principal: 1_000_001, monthlyRate: 0.75, termMonths: 120, paymentFrequency: "quincenal" },
    { principal: 101, monthlyRate: 1, termMonths: 3, paymentFrequency: "quincenal" }, // ₱1.01 over 6 installments
  ];
  for (const c of cases) {
    const s = ledger.buildSchedule({ ...c, releasedAt: "2026-10-19" });
    const interest = ledger.totalInterest(c.principal, c.monthlyRate, c.termMonths);
    assert.equal(s.length, c.termMonths * (c.paymentFrequency === "quincenal" ? 2 : 1));
    assert.equal(sum(s, "principalDue"), c.principal, "principal adds up");
    assert.equal(sum(s, "interestDue"), interest, "interest adds up");
    assert.equal(sum(s, "totalDue"), c.principal + interest);
    assert.equal(ledger.totalPayable(s), c.principal + interest);
    for (const x of s) {
      assert.ok(Number.isInteger(x.principalDue) && Number.isInteger(x.interestDue));
      assert.equal(x.totalDue, x.principalDue + x.interestDue);
      assert.ok(x.principalDue >= 0 && x.interestDue >= 0);
    }
  }
  // ₱60,000 at 1% a month for 24 months: ₱14,400 interest, ₱3,100 a month, ₱1,550 a quincena.
  const q = ledger.buildSchedule({ ...cases[0], releasedAt: "2026-10-19" });
  assert.equal(ledger.totalInterest(6_000_000, 1, 24), 1_440_000);
  assert.equal(q[0].totalDue, 155_000);
});

test("due dates: 15th and month end (quincenal) or month end (monthly), first at least 10 days after release", () => {
  assert.deepEqual(ledger.dueDates("2026-10-19", "quincenal", 4).map(iso), ["2026-10-31", "2026-11-15", "2026-11-30", "2026-12-15"]);
  assert.deepEqual(ledger.dueDates("2026-10-22", "quincenal", 2).map(iso), ["2026-11-15", "2026-11-30"], "Oct 31 is only 9 days away");
  assert.deepEqual(ledger.dueDates("2026-10-21", "quincenal", 1).map(iso), ["2026-10-31"], "exactly 10 days is enough");
  assert.deepEqual(ledger.dueDates("2026-11-03", "quincenal", 2).map(iso), ["2026-11-15", "2026-11-30"]);
  assert.deepEqual(ledger.dueDates("2026-10-25", "monthly", 3).map(iso), ["2026-11-30", "2026-12-31", "2027-01-31"]);
  assert.deepEqual(ledger.dueDates("2027-12-25", "monthly", 3).map(iso), ["2028-01-31", "2028-02-29", "2028-03-31"], "leap year");
  assert.deepEqual(ledger.dueDates("2027-02-10", "quincenal", 2).map(iso), ["2027-02-28", "2027-03-15"]);
});

test("payments go to the oldest installment first, interest before principal", () => {
  const s = ledger.buildSchedule({ principal: 6_000_000, monthlyRate: 1, termMonths: 24, paymentFrequency: "monthly", releasedAt: "2026-10-19" });
  // Each installment: ₱2,500 principal + ₱600 interest.
  const a = ledger.allocate(s, [{ amount: 400_000 }]);
  assert.equal(a.unapplied, 0);
  assert.deepEqual([a.schedule[0].interestPaid, a.schedule[0].principalPaid, a.schedule[0].paid], [60_000, 250_000, 310_000]);
  assert.deepEqual([a.schedule[1].interestPaid, a.schedule[1].principalPaid, a.schedule[1].paid], [60_000, 30_000, 90_000], "interest first");
  assert.equal(a.schedule[2].paid, 0);

  const voided = ledger.allocate(s, [{ amount: 400_000, voided: true }, { amount: 50_000 }]);
  assert.deepEqual([voided.schedule[0].interestPaid, voided.schedule[0].principalPaid], [50_000, 0], "voided payments don't count");

  const all = ledger.allocate(s, [{ amount: ledger.totalPayable(s) + 1 }]);
  assert.equal(all.unapplied, 1, "an overpayment is reported, not absorbed");
  assert.equal(ledger.summarize(all.schedule).balance, 0);
});

test("summary: balance, next due and past due", () => {
  const s = ledger.buildSchedule({ principal: 1_200_000, monthlyRate: 1, termMonths: 12, paymentFrequency: "monthly", releasedAt: "2026-01-05" });
  const { schedule } = ledger.allocate(s, [{ amount: s[0].totalDue }]);
  const onTime = ledger.summarize(schedule, "2026-02-27");
  assert.equal(onTime.amountPaid, s[0].totalDue);
  assert.equal(onTime.balance, ledger.totalPayable(s) - s[0].totalDue);
  assert.equal(onTime.pastDue, false);
  assert.equal(onTime.nextDue.no, 2);
  assert.equal(iso(new Date(onTime.nextDue.dueDate)), "2026-02-28");

  const late = ledger.summarize(schedule, "2026-03-01");
  assert.equal(late.pastDue, true, "Feb 28 installment unpaid on Mar 1");
  assert.equal(late.pastDueAmount, s[1].totalDue);
  assert.equal(ledger.summarize(schedule, "2026-02-28").pastDue, false, "due today is not past due");
});

test("today is the date in Manila", () => {
  assert.equal(iso(ledger.todayInManila(new Date("2026-10-19T17:30:00Z"))), "2026-10-20");
  assert.equal(iso(ledger.todayInManila(new Date("2026-10-19T15:59:00Z"))), "2026-10-19");
});
