// tipsFor and memberView: the member's own tips, without a database.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { scoreOf, tipsFor, memberView } = require("../src/services/memberScore");

// Signals as services/memberSignals.js returns them.
const signals = (over = {}) => ({
  savings: { hasPlan: true, rate12m: 1, missed3m: 0, recordedUntil: "2026-10", ...over.savings },
  meetings: { rate: 1, attended12m: 4, held12m: 4, pmes: true, ...over.meetings },
  bills: { lateRate: 0, recorded12m: 6, late12m: 0, ...over.bills },
  coMaker: { vouched: 0, good: 0, ...over.coMaker },
  backers: over.backers ?? 2,
  onAmnesty: over.onAmnesty ?? false,
});

test("weakest parts first, at most 3 tips", () => {
  const result = scoreOf(
    signals({ savings: { rate12m: 0.2, missed3m: 3 }, meetings: { rate: 0.25, attended12m: 1, pmes: false }, bills: { lateRate: 0.5, recorded12m: 4, late12m: 2 }, backers: 0 }),
    { priorLoans: 2, priorLatePayments: 1 },
  );
  const { tips } = tipsFor(result);
  assert.equal(tips.length, 3);
  // Ranked by weight × (1 − value): savings 30 × 0.8 = 24, then attendance 15 × 0.75 = 11.25,
  // then bills and repayment (15 × 0.5 each) and the network (5 × 1).
  assert.match(tips[0], /Deposit to your retirement plan every month/);
  assert.match(tips[1], /Attend the PMES/, "PMES not taken");
});

test("no tips for strong parts, and they show as strengths", () => {
  const result = scoreOf(signals(), { priorLoans: 3, priorLatePayments: 0 });
  const { tips, strengths } = tipsFor(result);
  assert.deepEqual(tips, []);
  assert.equal(strengths.length, 2);
  assert.ok(strengths.every((s) => s.startsWith("You ")), strengths.join(" | "));
});

test("no repayment tip without past loans, but a plan tip without a plan", () => {
  const result = scoreOf(signals({ savings: { hasPlan: false, rate12m: null, missed3m: null } }), { priorLoans: 0, priorLatePayments: 0 });
  const { tips } = tipsFor(result);
  assert.ok(!tips.some((tip) => /current loans up to date/.test(tip)), "nothing to act on");
  assert.match(tips[0], /Open a retirement plan/);
});

test("missed deposits are counted in the tip", () => {
  const result = scoreOf(signals({ savings: { rate12m: 0.9, missed3m: 2 } }), { priorLoans: 1, priorLatePayments: 0 });
  assert.ok(tipsFor(result).tips.includes("You missed 2 of the last 3 monthly deposits. Catching up helps."));
});

test("the member view speaks to the member", () => {
  const view = memberView(scoreOf(signals({ backers: 0 }), { priorLoans: 0, priorLatePayments: 0 }));
  const net = view.parts.find((p) => p.key === "network");
  assert.equal(net.label, "Members who vouch for you");
  assert.equal(net.detail, "No member has vouched for you yet.");
  assert.equal(view.parts.find((p) => p.key === "coMaker").detail, "You have not been a co-maker yet.");
  assert.equal(view.parts.find((p) => p.key === "repayment").detail, "You have no past mutual assistance.");
  assert.ok(!view.parts.some((p) => /\bthem\b|\btheir\b/.test(p.label + p.detail)));
  assert.deepEqual(Object.keys(view).sort(), ["band", "coverage", "parts", "score", "strengths", "tips"]);
});
