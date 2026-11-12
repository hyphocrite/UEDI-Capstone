// Member score (alternative data) and early warning.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, staffUp, releasedLoan, daysAgo } = require("./helpers");
const { scoreOf } = require("../src/services/memberScore");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
});

after(async () => {
  if (uri) await t.close();
});

/** "YYYY-MM" n months before this month. */
const monthsAgo = (n) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

async function planFor(memberId, paidMonthsAgo) {
  const RetirementPlan = require("../src/models/RetirementPlan");
  await RetirementPlan.create({
    memberId,
    memberName: memberId,
    startDate: new Date(Date.UTC(new Date().getUTCFullYear() - 2, 0, 1)),
    monthlyContribution: 50000,
    planShare: 40000,
    contributions: paidMonthsAgo.map((n) => ({ month: monthsAgo(n), amount: 40000, dues: 10000, paidAt: new Date(`${monthsAgo(n)}-20T00:00:00Z`), method: "payroll", source: "manual" })),
  });
}

test("meetings, bills and savings make up the member score; members can't record them", { skip }, async () => {
  const Member = require("../src/models/Member");
  await Member.create([
    { memberId: "S-1", lastName: "Saver", firstName: "Sol", joinedAt: new Date("2015-01-01") },
    { memberId: "S-2", lastName: "Skipper", firstName: "Sky", joinedAt: new Date("2015-01-01") },
  ]);
  await planFor("S-1", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  await planFor("S-2", [7, 8, 9, 10, 11, 12]);
  const c = staff.officer.cookie;

  const meeting = await t.call("/meetings", { method: "POST", cookie: c, body: { title: "General Assembly", kind: "general_assembly", date: daysAgo(30) } });
  assert.equal(meeting.status, 201, meeting.json.error);
  const id = meeting.json.meeting._id;
  assert.equal((await t.call(`/meetings/${id}/attendance`, { method: "PUT", cookie: c, body: { attendees: ["S-1", "NOPE"] } })).status, 400);
  assert.equal((await t.call(`/meetings/${id}/attendance`, { method: "PUT", cookie: c, body: { attendees: ["S-1"] } })).status, 200);
  assert.equal((await t.call("/members/S-1/bills", { method: "POST", cookie: c, body: { kind: "electricity", month: monthsAgo(1), status: "on_time" } })).status, 201);
  assert.equal((await t.call("/members/S-2/bills", { method: "POST", cookie: c, body: { kind: "mobile_load", month: monthsAgo(1), status: "late" } })).status, 201);
  const someone = await t.register("Plain Member", "plain2@uedi.test");
  assert.equal((await t.call("/meetings", { cookie: someone.cookie })).status, 403);

  const one = (await t.call("/members/S-1", { cookie: c })).json.score;
  const two = (await t.call("/members/S-2", { cookie: c })).json.score;
  assert.ok(one.score > two.score + 30, `${one.score} vs ${two.score}`);
  assert.equal(one.parts.find((p) => p.key === "savings").value, 1);
  assert.match(two.parts.find((p) => p.key === "savingsRecent").detail, /Missed 3 of the last 3/);
  assert.equal(two.parts.find((p) => p.key === "bills").value, 0);
  const listed = (await t.call("/members", { cookie: c })).json.members.find((m) => m.memberId === "S-1");
  assert.equal(listed.score.score, one.score, "the list and the record agree");
});

test("a member with no data gets 'limited', not a low score", () => {
  const s = scoreOf({
    savings: { hasPlan: true, monthsSinceLast: null, missed3m: null, rate12m: null },
    meetings: { rate: null, pmes: false },
    bills: { lateRate: null },
    coMaker: { vouched: 0 },
    backers: 0,
    onAmnesty: false,
  });
  assert.equal(s.band, "limited");
});

test("early warning flags an active loan whose borrower stopped saving, before any missed payment", { skip }, async () => {
  await planFor("W-1", [1, 2, 3, 4, 5, 6]);
  await planFor("W-2", [4, 5, 6, 7]);
  const steady = await releasedLoan(t, staff, { memberId: "W-1", releasedAt: daysAgo(20), loan: { amount: 20000, termMonths: 12 } });
  const slipping = await releasedLoan(t, staff, { memberId: "W-2", releasedAt: daysAgo(20), loan: { amount: 20000, termMonths: 12 } });
  const outsider = await t.register("Xavier Outsider", "x-ew@uedi.test");
  assert.equal((await t.call("/early-warning", { cookie: outsider.cookie })).status, 403);
  const res = await t.call("/early-warning", { cookie: staff.officer.cookie });
  assert.equal(res.status, 200, res.json.error);
  const list = res.json.loans;
  const s = list.find((l) => l.loanNo === slipping.loanNo);
  const ok = list.find((l) => l.loanNo === steady.loanNo);
  assert.equal(s.level, "high");
  assert.equal(s.pastDue, false, "flagged before missing a payment");
  assert.equal(s.inputs.contributions_missed_3m, 3);
  assert.equal(ok.inputs.contributions_missed_3m, 0);
  assert.equal(ok.level, "low");
  assert.ok(list.indexOf(s) < list.indexOf(ok), "riskiest first");
  assert.match(s.reasons[0].text, /savings/);
});
