// Co-makers: named on the application, confirm in their portal before signing, see the loans
// they vouched for and get alerts when the borrower misses a payment.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, daysAgo } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  const Setting = require("../src/models/Setting");
  await Setting.updateOne({ key: "loan" }, { $set: { coMakersRequired: 1 } });
  const Member = require("../src/models/Member");
  await Member.create([
    { memberId: "C-10", lastName: "Borrower", firstName: "Ben" },
    { memberId: "C-11", lastName: "Backer", firstName: "Bea" },
    { memberId: "C-12", lastName: "Nobody", firstName: "Noel" },
    { memberId: "C-20", lastName: "Declined", firstName: "Dee" },
  ]);
});

after(async () => {
  if (uri) await t.close();
});

const link = (userId, memberId) => t.call(`/auth/users/${userId}/member`, { method: "PATCH", cookie: staff.officer.cookie, body: { memberId } });
const sign = (app, role, decision = "approved") =>
  t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body: { decision, note: decision === "denied" ? "No" : undefined } });

let backer;

test("co-makers must be members with accounts, confirm before signing, and see the loan they vouched for", { skip }, async () => {
  const borrower = await t.register("Ben Borrower", "ben@uedi.test");
  backer = await t.register("Bea Backer", "bea@uedi.test");
  await link(borrower.id, "C-10");
  await link(backer.id, "C-11");
  const file = (coMakers) => t.call("/applications", { method: "POST", cookie: borrower.cookie, body: { ...application(0), coMakers } });

  assert.match((await file([])).json.error, /Name a co-maker/);
  assert.match((await file(["C-12"])).json.error, /has no account yet/);
  assert.match((await file(["C-10"])).json.error, /their own co-maker/);
  assert.match((await file(["C-11", "C-11"])).json.error, /once/);
  assert.equal((await t.call("/comaker/lookup?memberId=C-11", { cookie: borrower.cookie })).json.name, "Bea Backer");

  const filed = await file(["C-11"]);
  assert.equal(filed.status, 201, filed.json.error);
  const app = filed.json.application;
  assert.deepEqual(app.coMakers.map((c) => [c.memberId, c.status]), [["C-11", "pending"]]);
  const { outbox } = require("../src/services/mailer");
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(outbox.some((m) => m.to === "bea@uedi.test" && /co-maker/.test(m.subject)), "the co-maker is emailed");

  const early = await sign(app, "bookkeeper");
  assert.equal(early.status, 409);
  assert.equal(early.json.code, "CO_MAKERS_PENDING");

  const portal = (await t.call("/comaker", { cookie: backer.cookie })).json;
  assert.equal(portal.requests[0].myStatus, "pending");
  assert.equal(portal.requests[0].assessment, undefined, "no scores in the portal");
  assert.equal((await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: borrower.cookie, body: { decision: "accepted" } })).status, 404, "only the named co-maker answers");
  assert.equal((await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: backer.cookie, body: { decision: "accepted" } })).status, 200);
  assert.equal((await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: backer.cookie, body: { decision: "declined" } })).status, 409, "once");

  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) assert.equal((await sign(app, role)).status, 200, role);
  const loanId = (await t.call(`/applications/${app._id}`, { cookie: staff.officer.cookie })).json.application.loanId;
  const released = await t.call(`/loans/${loanId}/release`, { method: "POST", cookie: staff.signer.treasurer.cookie, body: { releasedAt: daysAgo(5), voucherNo: "CV-77" } });
  assert.equal(released.status, 200, released.json.error);

  let mine = (await t.call("/comaker", { cookie: backer.cookie })).json;
  assert.equal(mine.loans[0].standing, "on_track");
  assert.deepEqual(mine.alerts, []);

  // The borrower's payroll deduction is missed: the co-maker gets an alert and an email.
  const Loan = require("../src/models/Loan");
  await Loan.updateOne({ _id: loanId }, { $set: { lastDeduction: { result: "missed", cutoffDate: new Date() } } });
  mine = (await t.call("/comaker", { cookie: backer.cookie })).json;
  assert.equal(mine.loans[0].standing, "behind");
  assert.match(mine.alerts[0].text, /missed/);
  await require("../src/services/coMakers").notifyMissed([{ loan: loanId, result: "missed" }]);
  assert.ok(outbox.some((m) => m.to === "bea@uedi.test" && /missed a loan payment/.test(m.subject)));
});

test("a declined co-maker blocks approval but not denial", { skip }, async () => {
  const borrower = await t.register("Dee Declined", "dee@uedi.test");
  await link(borrower.id, "C-20");
  const app = (await t.call("/applications", { method: "POST", cookie: borrower.cookie, body: { ...application(0), coMakers: ["C-11"] } })).json.application;
  await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: backer.cookie, body: { decision: "declined", note: "Not this time" } });
  const blocked = await sign(app, "bookkeeper");
  assert.equal(blocked.status, 409);
  assert.match(blocked.json.error, /declined/);
  assert.equal((await sign(app, "bookkeeper", "denied")).status, 200);
});
