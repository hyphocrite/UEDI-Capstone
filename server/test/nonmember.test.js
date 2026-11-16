// Applicants not linked to a UDEI member number (no member record, or only the provisional N-… ID
// from sign-up) borrow at most ₱5,000 and need a full UDEI member as co-maker.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let provisionalId;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  const Setting = require("../src/models/Setting");
  await Setting.updateOne({ key: "loan" }, { $set: { nonMemberMaxAmount: 5000 } });
  const Member = require("../src/models/Member");
  await Member.create([
    { memberId: "L-1", lastName: "Linked", firstName: "Linda" },
    { memberId: "L-2", lastName: "Comaker", firstName: "Carl" },
  ]);
  // A full member with an account, who can confirm as co-maker.
  const carl = await t.register("Carl Comaker", "carl@uedi.test");
  const linked = await t.call(`/auth/users/${carl.id}/member`, { method: "PATCH", cookie: staff.officer.cookie, body: { memberId: "L-2" } });
  assert.equal(linked.status, 200, linked.json.error);
  // An account that only has its own new ID from sign-up.
  const nora = await t.register("Nora New", "nora@uedi.test");
  provisionalId = (await t.call("/auth/me", { cookie: nora.cookie })).json.session.memberId;
  assert.match(provisionalId, /^N-/);
});

after(async () => {
  if (uri) await t.close();
});

const file = (cookie, body) => t.call("/applications", { method: "POST", cookie, body });
const nonMember = (amount, coMakers = []) => ({ ...application(0, { loan: { amount } }), coMakers });

test("an applicant without a member number borrows at most ₱5,000, with a full member as co-maker", { skip }, async () => {
  const tooMuch = await file(staff.officer.cookie, nonMember(6000, ["L-2"]));
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.json.error, /at most ₱5,000/);

  const alone = await file(staff.officer.cookie, nonMember(5000));
  assert.equal(alone.status, 400);
  assert.match(alone.json.error, /need a co-maker/);

  const provisionalBacker = await file(staff.officer.cookie, nonMember(5000, [provisionalId]));
  assert.equal(provisionalBacker.status, 400);
  assert.match(provisionalBacker.json.error, /isn't linked to a UDEI member number/);

  const ok = await file(staff.officer.cookie, nonMember(5000, ["L-2"]));
  assert.equal(ok.status, 201, ok.json.error);
  assert.deepEqual(ok.json.application.coMakers.map((c) => c.memberId), ["L-2"]);
});

test("a member number not on record counts as not linked", { skip }, async () => {
  const unknown = await file(staff.officer.cookie, application(0, { applicant: { memberId: "X-404" }, loan: { amount: 25000 } }));
  assert.equal(unknown.status, 400);
  assert.match(unknown.json.error, /at most ₱5,000/);
});

test("an account with only its sign-up ID is limited too, a linked member is not", { skip }, async () => {
  const sam = await t.register("Sam Signup", "sam@uedi.test");
  const big = await file(sam.cookie, application(0, { loan: { amount: 25000 } }));
  assert.equal(big.status, 400);
  assert.match(big.json.error, /at most ₱5,000/);

  const member = await file(staff.officer.cookie, application(0, { applicant: { memberId: "L-1" }, loan: { amount: 60000 } }));
  assert.equal(member.status, 201, member.json.error);
});
