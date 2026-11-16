// GET /api/me/score: a member's own member score, never anyone else's.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, staffUp, lastCode } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  const Member = require("../src/models/Member");
  await Member.create([
    { memberId: "S-01", lastName: "Score", firstName: "Sara" },
    { memberId: "S-02", lastName: "Other", firstName: "Omar" },
    { memberId: "S-03", lastName: "Phone", firstName: "Pia" },
  ]);
});

after(async () => {
  if (uri) await t.close();
});

const link = (userId, memberId) => t.call(`/auth/users/${userId}/member`, { method: "PATCH", cookie: staff.officer.cookie, body: { memberId } });

test("a linked member gets their own score, worded to them, and nobody else's", { skip }, async () => {
  const sara = await t.register("Sara Score", "sara@uedi.test");
  assert.equal((await link(sara.id, "S-01")).status, 200);

  const mine = await t.call("/me/score", { cookie: sara.cookie });
  assert.equal(mine.status, 200, mine.json.error);
  assert.equal(mine.json.linked, true);
  assert.equal(mine.json.memberId, "S-01");
  assert.match(mine.json.asOf, /^\d{4}-\d{2}-\d{2}$/);
  const s = mine.json.score;
  assert.ok(["strong", "good", "fair", "weak", "limited"].includes(s.band));
  assert.equal(s.parts.length, 7);
  assert.ok(s.parts.some((p) => p.label === "Members who vouch for you"));
  assert.ok(s.parts.some((p) => p.detail === "You have not been a co-maker yet."));
  assert.ok(Array.isArray(s.tips) && s.tips.length <= 3 && s.tips.length > 0);
  assert.ok(s.tips.some((tip) => /retirement plan/.test(tip)), "no plan yet: told to open one");

  // Asking for someone else still gives your own.
  const sneaky = await t.call("/me/score?memberId=S-02", { cookie: sara.cookie });
  assert.equal(sneaky.json.memberId, "S-01");
  const sneakyBody = await t.call("/me/score", { cookie: sara.cookie, method: "GET", headers: { "X-Member-Id": "S-02" } });
  assert.equal(sneakyBody.json.memberId, "S-01");

  // Never the ML credit score of an application.
  const text = JSON.stringify(mine.json);
  assert.ok(!/defaultProbability|creditScore|assessment|ensemble/.test(text));
});

test("the mobile app gets its own score with a Bearer token", { skip }, async () => {
  const email = "pia@uedi.test";
  await t.call("/member/register", { method: "POST", body: { fullName: "Pia Phone", email, memberNo: "S-03", password: "secret123" } });
  const token = (await t.call("/member/verify-email", { method: "POST", body: { email, code: lastCode(email) } })).json.token;
  const bearer = (path) => t.call(path, { headers: { Authorization: `Bearer ${token}` } });

  // A new account has only its own new ID: not linked yet.
  assert.deepEqual((await bearer("/me/score")).json, { linked: false, score: null });

  const users = (await t.call("/auth/users", { cookie: staff.officer.cookie })).json.users;
  assert.equal((await link(users.find((u) => u.email === email).id, "S-03")).status, 200);
  const linked = await bearer("/me/score");
  assert.equal(linked.json.linked, true);
  assert.equal(linked.json.memberId, "S-03");
});

test("unlinked and signed-out requests", { skip }, async () => {
  const lone = await t.register("Lone Ranger", "lone@uedi.test");
  const r = await t.call("/me/score", { cookie: lone.cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { linked: false, score: null });
  assert.equal((await t.call("/me/score")).status, 401);
});
