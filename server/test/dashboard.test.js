// Integration test for the office dashboard (GET /api/dashboard).
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, releasedLoan } = require("./helpers");

let t;
let staff;
const skip = !uri && "TEST_MONGODB_URI not set";

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
});

after(async () => {
  if (uri) await t.close();
});

test("the dashboard counts loans and applications, for Loan Officers and up", { skip }, async () => {
  const loan = await releasedLoan(t, staff, { memberId: "D-0001", loan: { amount: 24000, termMonths: 12 } });
  // Two waiting applications, both at the Bookkeeper.
  for (let i = 0; i < 2; i++) {
    const r = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application() });
    assert.equal(r.status, 201, r.json.error);
  }

  const member = await t.register("Dina Member", "dina.member@uedi.test");
  assert.equal((await t.call("/dashboard", { cookie: member.cookie })).status, 403, "members don't see the office dashboard");
  assert.equal((await t.call("/dashboard")).status, 401);

  const officer = await t.call("/dashboard", { cookie: staff.officer.cookie });
  assert.equal(officer.status, 200, officer.json.error);
  const d = officer.json;
  assert.equal(d.loans.active, 1);
  assert.equal(d.loans.outstanding, loan.balance, "outstanding is the active loans' balance");
  assert.equal(d.applications.pending, 2);
  assert.equal(d.applications.byStep.bookkeeper, 2);
  assert.equal(d.applications.awaitingYou, 0, "a Loan Officer signs nothing");
  assert.equal(d.applications.decidedThisMonth.approved, 1, "the released loan was approved this month");
  assert.ok(d.applications.recent.length >= 3);
  assert.ok(d.members.accountsToLink >= 1, "the new member account still has only its new ID");
  assert.equal(d.collections, undefined, "money over time follows Reports: Treasurer and up");

  const bookkeeper = (await t.call("/dashboard", { cookie: staff.signer.bookkeeper.cookie })).json;
  assert.equal(bookkeeper.applications.awaitingYou, 2, "both wait for the Bookkeeper's signature");

  const treasurer = (await t.call("/dashboard", { cookie: staff.signer.treasurer.cookie })).json;
  assert.equal(treasurer.collections.length, 6);
  assert.ok(treasurer.collections.every((m) => Number.isInteger(m.loans) && Number.isInteger(m.plans)));
});
