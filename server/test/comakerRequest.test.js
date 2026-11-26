// A signer asks for a co-maker on a member's application, case by case: approving waits until a
// co-maker accepts, or until the signer who asked withdraws the request.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let borrower;
let backer;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  const Member = require("../src/models/Member");
  await Member.create([
    { memberId: "R-10", lastName: "Reyes", firstName: "Rita" },
    { memberId: "R-11", lastName: "Backer", firstName: "Rob" },
  ]);
  borrower = await t.register("Rita Reyes", "rita@uedi.test");
  backer = await t.register("Rob Backer", "rob@uedi.test");
  for (const [u, id] of [[borrower, "R-10"], [backer, "R-11"]]) {
    await t.call(`/auth/users/${u.id}/member`, { method: "PATCH", cookie: staff.officer.cookie, body: { memberId: id } });
  }
});

after(async () => {
  if (uri) await t.close();
});

const file = async () => {
  const r = await t.call("/applications", { method: "POST", cookie: borrower.cookie, body: { ...application(0, { loan: { amount: 60000 } }), coMakers: [] } });
  assert.equal(r.status, 201, r.json.error);
  return r.json.application;
};
const sign = (app, role, decision = "approved") =>
  t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body: { decision, note: decision === "denied" ? "No co-maker found." : undefined } });
const ask = (app, who, note) => t.call(`/applications/${app._id}/co-maker-request`, { method: "POST", cookie: who.cookie, body: { note } });

test("a signer's request for a co-maker blocks approving until a co-maker accepts", { skip }, async () => {
  const app = await file();
  assert.equal((await sign(app, "bookkeeper")).status, 200);

  assert.equal((await ask(app, staff.officer, "Need one")).status, 403, "loan officers don't ask");
  assert.equal((await ask(app, staff.signer.crecom_chair, "")).status, 400, "the note is required");
  const asked = await ask(app, staff.signer.crecom_chair, "Amount is high for 6 months of service");
  assert.equal(asked.status, 200, asked.json.error);
  assert.equal(asked.json.application.coMakerRequest.note, "Amount is high for 6 months of service");
  assert.equal(asked.json.application.coMakerRequest.role, "crecom_chair");
  assert.equal((await ask(app, staff.signer.president, "Me too")).status, 409, "one request at a time");

  const { outbox } = require("../src/services/mailer");
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(outbox.some((m) => m.to === "rita@uedi.test" && /co-maker is needed/.test(m.subject)), "the applicant is emailed");

  const blocked = await sign(app, "crecom_chair");
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.code, "CO_MAKER_REQUESTED");
  assert.match(blocked.json.error, /asked for a co-maker/);

  // The applicant sees the request and names a co-maker, although the Bookkeeper already signed.
  const mine = (await t.call(`/applications/${app._id}`, { cookie: borrower.cookie })).json.application;
  assert.equal(mine.coMakerRequest.note, "Amount is high for 6 months of service");
  const named = await t.call(`/applications/${app._id}/co-makers`, { method: "PUT", cookie: borrower.cookie, body: { coMakers: ["R-11"] } });
  assert.equal(named.status, 200, named.json.error);
  assert.equal((await sign(app, "crecom_chair")).json.code, "CO_MAKERS_PENDING", "still waiting for the co-maker's answer");

  assert.equal((await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: backer.cookie, body: { decision: "accepted", consent: true } })).status, 200);
  for (const role of ["crecom_chair", "president", "treasurer"]) assert.equal((await sign(app, role)).status, 200, role);
});

test("withdrawing the request unblocks signing, and only the signer who asked can withdraw", { skip }, async () => {
  const app = await file();
  assert.equal((await ask(app, staff.signer.bookkeeper, "Short service; ask for a co-maker")).status, 200);
  assert.equal((await sign(app, "bookkeeper")).status, 409);

  const other = await t.call(`/applications/${app._id}/co-maker-request`, { method: "DELETE", cookie: staff.signer.president.cookie });
  assert.equal(other.status, 403);
  const withdrawn = await t.call(`/applications/${app._id}/co-maker-request`, { method: "DELETE", cookie: staff.signer.bookkeeper.cookie });
  assert.equal(withdrawn.status, 200, withdrawn.json.error);
  assert.equal(withdrawn.json.application.coMakerRequest, undefined);
  assert.equal((await sign(app, "bookkeeper")).status, 200);
});

test("a denial still goes through while a co-maker is asked for", { skip }, async () => {
  const app = await file();
  await ask(app, staff.signer.bookkeeper, "Need a co-maker for this amount");
  const denied = await sign(app, "bookkeeper", "denied");
  assert.equal(denied.status, 200, denied.json.error);
  assert.equal(denied.json.application.status, "denied");
});

test("co-makers can't be added after signing started unless a signer asked", { skip }, async () => {
  const app = await file();
  assert.equal((await sign(app, "bookkeeper")).status, 200);
  const late = await t.call(`/applications/${app._id}/co-makers`, { method: "PUT", cookie: borrower.cookie, body: { coMakers: ["R-11"] } });
  assert.equal(late.status, 409);
});
