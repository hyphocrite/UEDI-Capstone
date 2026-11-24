// The four-signature approval chain and role management.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { uri, setup, application } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let admin;
let officer;
let signer;

before(async () => {
  if (!uri) return;
  t = await setup();
  admin = await t.register("Admin One", "admin@uedi.test");
  officer = await t.userWithRole(admin.cookie, "loan_officer", "Lorna Officer");
  signer = {};
  for (const role of ["bookkeeper", "treasurer", "crecom_chair", "president"]) signer[role] = await t.userWithRole(admin.cookie, role);
});

after(async () => {
  if (uri) await t.close();
});

const submit = async (late = 0) =>
  (await t.call("/applications", { method: "POST", cookie: officer.cookie, body: application(late) })).json.application;
const sign = (app, who, body) => t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: who.cookie, body });

test("roles: only admins change them, never their own, and one admin always remains", { skip }, async () => {
  const users = await t.call("/auth/users", { cookie: admin.cookie });
  assert.ok(users.json.users.some((u) => u.role === "crecom_chair"));

  const staff = await t.register("Staff Two", "staff@uedi.test");
  assert.equal((await t.call(`/auth/users/${staff.id}/role`, { method: "PATCH", cookie: staff.cookie, body: { role: "admin" } })).status, 403);
  assert.equal((await t.call(`/auth/users/${staff.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "boss" } })).status, 400);
  const self = await t.call(`/auth/users/${admin.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "staff" } });
  assert.equal(self.status, 400);
  assert.match(self.json.error, /own role/);

  const made = await t.call(`/auth/users/${staff.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "treasurer" } });
  assert.equal(made.status, 200);
  assert.equal(made.json.user.role, "treasurer");
  assert.equal((await t.call("/auth/me", { cookie: staff.cookie })).json.session.role, "treasurer", "takes effect at once");

  // Because nobody can change their own role, the last admin can only be lost when two admins
  // demote each other at the same moment. Race it a few times: an admin must always remain.
  const User = mongoose.model("User");
  const second = await t.register("Admin Two", "admin2@uedi.test");
  for (let round = 0; round < 5; round++) {
    await User.updateMany({ _id: { $in: [admin.id, second.id] } }, { $set: { role: "admin" } });
    const [a, b] = await Promise.all([
      t.call(`/auth/users/${second.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "staff" } }),
      t.call(`/auth/users/${admin.id}/role`, { method: "PATCH", cookie: second.cookie, body: { role: "staff" } }),
    ]);
    assert.ok(!(a.status === 200 && b.status === 200), "both demotions can't succeed");
    assert.ok([200, 403, 409].includes(a.status) && [200, 403, 409].includes(b.status));
    assert.ok((await User.countDocuments({ role: "admin" })) >= 1, "an admin remains");
  }
  await User.updateOne({ _id: admin.id }, { $set: { role: "admin" } });
  await User.updateOne({ _id: second.id }, { $set: { role: "staff" } });
});

test("signing in order, wrong role, notes, and awaiting=me", { skip }, async () => {
  const app = await submit(0); // suggestion: approve
  assert.equal(app.currentStep, "bookkeeper");

  const early = await sign(app, signer.crecom_chair, { decision: "approved" });
  assert.equal(early.status, 403);
  assert.match(early.json.error, /Bookkeeper's turn/);
  assert.equal((await sign(app, signer.treasurer, { decision: "approved" })).status, 403, "the Treasurer signs last");
  assert.equal((await sign(app, officer, { decision: "approved" })).status, 403);

  const mine = await t.call("/applications?awaiting=me", { cookie: signer.bookkeeper.cookie });
  assert.ok(mine.json.applications.some((a) => a._id === app._id));
  assert.equal((await t.call("/applications?awaiting=me", { cookie: signer.crecom_chair.cookie })).json.applications.some((a) => a._id === app._id), false);

  const badBooks = await sign(app, signer.bookkeeper, { decision: "approved", bookkeeper: "not an object" });
  assert.equal(badBooks.status, 400);

  const booked = await sign(app, signer.bookkeeper, {
    decision: "approved",
    bookkeeper: { longTermBalance: 15000, longTermDueDate: "2027-06-30", shortTermBalance: 2500 },
  });
  assert.equal(booked.status, 200);
  assert.equal(booked.json.application.currentStep, "crecom_chair");
  assert.equal(booked.json.application.bookkeeper.longTermBalance, 15000, "the Bookkeeper's correction is saved");
  assert.equal(booked.json.application.approvals[0].followedSuggestion, true);
  assert.ok((await t.call("/applications?awaiting=me", { cookie: signer.crecom_chair.cookie })).json.applications.some((a) => a._id === app._id));

  const booksLater = await sign(app, signer.crecom_chair, { decision: "approved", bookkeeper: { longTermBalance: 0 } });
  assert.equal(booksLater.status, 400, "balances can only change at the Bookkeeper step");

  const againstNoNote = await sign(app, signer.crecom_chair, { decision: "denied" });
  assert.equal(againstNoNote.status, 400);

  assert.equal((await sign(app, signer.crecom_chair, { decision: "approved" })).json.application.currentStep, "president");
  const toTreasurer = await sign(app, signer.president, { decision: "approved" });
  assert.equal(toTreasurer.json.application.currentStep, "treasurer");
  assert.equal(toTreasurer.json.application.status, "pending", "the President's signature isn't the last one");
  assert.equal(toTreasurer.json.application.loanNo, undefined);
  const done = await sign(app, signer.treasurer, { decision: "approved" });
  assert.equal(done.json.application.status, "approved");
  assert.equal(done.json.application.currentStep, "none");
  assert.deepEqual(done.json.application.approvals.map((a) => a.step), ["bookkeeper", "crecom_chair", "president", "treasurer"]);
  assert.match(done.json.application.loanNo, /^MA-\d{4}-0001$/, "the Treasurer's final signature creates the loan");

  const after = await sign(app, signer.treasurer, { decision: "approved" });
  assert.equal(after.status, 409);
});

test("going against the suggestion needs a note at every step, and a denial ends the chain", { skip }, async () => {
  const risky = await submit(3); // suggestion: deny
  const noNote = await sign(risky, signer.bookkeeper, { decision: "approved" });
  assert.equal(noNote.status, 400);
  assert.match(noNote.json.error, /against the suggestion/);
  const withNote = await sign(risky, signer.bookkeeper, { decision: "approved", note: "Balances checked; co-maker is a long-time member." });
  assert.equal(withNote.json.application.approvals[0].followedSuggestion, false);
  assert.equal((await sign(risky, signer.crecom_chair, { decision: "approved" })).status, 400, "the rule applies at the CreCom Chairman too");

  const deniedNoNote = await sign(risky, signer.crecom_chair, { decision: "denied" });
  assert.equal(deniedNoNote.status, 400, "a denial always needs a note");
  const denied = await sign(risky, signer.crecom_chair, { decision: "denied", note: "Net pay too low after deductions." });
  assert.equal(denied.json.application.status, "denied");
  assert.equal(denied.json.application.currentStep, "none");
  assert.equal(denied.json.application.loanNo, undefined, "no loan for a denied application");
  assert.equal((await sign(risky, signer.president, { decision: "approved" })).status, 409);
});

test("one person can't sign two steps, even after a role change", { skip }, async () => {
  const app = await submit(0);
  await sign(app, signer.bookkeeper, { decision: "approved" });
  const moved = await t.call(`/auth/users/${signer.bookkeeper.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "crecom_chair" } });
  assert.equal(moved.status, 200);

  assert.equal((await t.call("/applications?awaiting=me", { cookie: signer.bookkeeper.cookie })).json.applications.some((a) => a._id === app._id), false);
  const twice = await sign(app, signer.bookkeeper, { decision: "approved" });
  assert.equal(twice.status, 403);
  assert.match(twice.json.error, /already signed/);
  assert.equal((await sign(app, signer.crecom_chair, { decision: "approved" })).status, 200, "a different CreCom Chairman can sign");
  await t.call(`/auth/users/${signer.bookkeeper.id}/role`, { method: "PATCH", cookie: admin.cookie, body: { role: "bookkeeper" } });
});

test("applications signed partly in the old order carry on with whoever is left", { skip }, async () => {
  const Application = mongoose.model("Application");
  const at = (app, approvals, currentStep) =>
    Application.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(app._id) },
      { $set: { currentStep, approvals: approvals.map((step) => ({ step, decision: "approved", signedByName: `Old ${step}`, signedAt: new Date() })) } },
    );
  const has = async (who, app) => (await t.call("/applications?awaiting=me", { cookie: who.cookie })).json.applications.some((a) => a._id === app._id);

  // Old order: the Bookkeeper signed, so it was waiting for the Treasurer. Now the CreCom Chairman is next.
  const one = await submit(0);
  await at(one, ["bookkeeper"], "treasurer");
  assert.equal((await t.call(`/applications/${one._id}`, { cookie: officer.cookie })).json.application.currentStep, "crecom_chair");
  assert.equal(await has(signer.treasurer, one), false);
  assert.equal(await has(signer.crecom_chair, one), true);

  // Old order: the Bookkeeper and Treasurer signed. The CreCom Chairman and President finish it.
  const two = await submit(0);
  await at(two, ["bookkeeper", "treasurer"], "crecom_chair");
  assert.equal((await sign(two, signer.crecom_chair, { decision: "approved" })).json.application.currentStep, "president");
  const done = await sign(two, signer.president, { decision: "approved" });
  assert.equal(done.json.application.status, "approved", "the Treasurer already signed, so this completes the chain");
  assert.ok(done.json.application.loanNo);
});

test("applications saved before the chain start at the Bookkeeper; old decisions still show", { skip }, async () => {
  const Application = mongoose.model("Application");
  const fresh = await submit(0);
  const raw = Application.collection;
  await raw.updateOne({ _id: new mongoose.Types.ObjectId(fresh._id) }, { $unset: { currentStep: "", approvals: "" } });
  const legacyDecided = { ...(await raw.findOne({ _id: new mongoose.Types.ObjectId(fresh._id) })), _id: new mongoose.Types.ObjectId(), applicationNo: "APP-2025-0099", status: "approved", decision: { decision: "approved", decidedByName: "Old Officer", decidedAt: new Date("2025-05-01") } };
  await raw.insertOne(legacyDecided);

  const got = (await t.call(`/applications/${fresh._id}`, { cookie: officer.cookie })).json.application;
  assert.equal(got.currentStep, "bookkeeper");
  assert.deepEqual(got.approvals, []);
  assert.ok((await t.call("/applications?awaiting=me", { cookie: signer.bookkeeper.cookie })).json.applications.some((a) => a._id === fresh._id));
  assert.equal((await sign(got, signer.bookkeeper, { decision: "approved" })).json.application.currentStep, "crecom_chair");

  const old = (await t.call(`/applications/${legacyDecided._id}`, { cookie: officer.cookie })).json.application;
  assert.equal(old.currentStep, "none");
  assert.equal(old.decision.decidedByName, "Old Officer");
});
