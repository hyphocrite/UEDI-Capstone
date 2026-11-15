// The applicant changes their application until the Bookkeeper signs, and adds supporting documents
// until it is decided.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { uri, setup, application, staffUp } = require("./helpers");

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

const sign = (app, role, decision = "approved") =>
  t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer[role].cookie, body: { decision, note: decision === "denied" ? "No" : undefined } });
const edit = (cookie, app, changes) =>
  t.call(`/applications/${app._id}`, { method: "PUT", cookie, body: { ...application(0), ...changes, loan: { ...application(0).loan, ...changes.loan } } });
const addDocs = (cookie, app, documents) => t.call(`/applications/${app._id}/documents`, { method: "POST", cookie, body: { documents } });

test("the applicant changes the application until the Bookkeeper signs", { skip }, async () => {
  const member = await t.register("Ella Editor", "ella@uedi.test");
  const filed = await t.call("/applications", { method: "POST", cookie: member.cookie, body: application(0) });
  assert.equal(filed.status, 201, filed.json.error);
  const app = filed.json.application;

  const changed = await edit(member.cookie, app, { loan: { amount: 75000, purpose: "Roof repair" } });
  assert.equal(changed.status, 200, changed.json.error);
  assert.equal(changed.json.application.loan.amount, 75000);
  assert.equal(changed.json.application.loan.purpose, "Roof repair");
  assert.ok(changed.json.application.editedAt);
  assert.equal(changed.json.application.applicant.memberId, app.applicant.memberId, "stays under the same member");
  assert.equal(changed.json.application.applicationNo, app.applicationNo);

  // The same checks as filing.
  assert.equal((await edit(member.cookie, app, { loan: { purpose: "" } })).status, 400);
  // Nobody else can change it, not even staff.
  const stranger = await t.register("Sam Stranger", "sam@uedi.test");
  assert.equal((await edit(stranger.cookie, app, {})).status, 403);
  assert.equal((await edit(staff.officer.cookie, app, {})).status, 403);

  // Once the Bookkeeper signs, the form is closed.
  assert.equal((await sign(app, "bookkeeper")).status, 200);
  const late = await edit(member.cookie, app, { loan: { amount: 100000 } });
  assert.equal(late.status, 409);
  assert.equal(late.json.code, "EDIT_CLOSED");
  assert.match(late.json.error, /still add supporting documents/);
});

test("supporting documents can be added after signatures, until the application is decided", { skip }, async () => {
  const member = await t.register("Dan Documents", "dan@uedi.test");
  const app = (await t.call("/applications", { method: "POST", cookie: member.cookie, body: application(0) })).json.application;
  assert.equal((await sign(app, "bookkeeper")).status, 200);
  assert.equal((await sign(app, "treasurer")).status, 200);

  const file = Buffer.from("%PDF-1.4 payslip");
  const sha256 = crypto.createHash("sha256").update(file).digest("hex");
  assert.equal((await addDocs(member.cookie, app, [])).status, 400);
  const stranger = await t.register("Nina Nosy", "nina@uedi.test");
  assert.equal((await addDocs(stranger.cookie, app, [{ fileName: "x.pdf", sha256 }])).status, 403);

  const added = await addDocs(member.cookie, app, [{ fileName: "payslip.pdf", type: "payslip", verdict: "verified", sha256 }]);
  assert.equal(added.status, 201, added.json.error);
  const [index] = added.json.indexes;
  assert.equal(index, app.documents.length, "added after the ones filed with the application");
  assert.ok(added.json.application.documents[index].addedAt, "signers can tell it was added later");
  assert.equal(added.json.application.approvals.length, 2, "the signatures stay");

  // Then the file itself, through the usual upload.
  const res = await fetch(`${t.baseUrl}/applications/${app._id}/documents/${index}`, { method: "PUT", headers: { Cookie: member.cookie, "Content-Type": "application/pdf" }, body: file });
  assert.equal(res.status, 200, (await res.json()).error);

  // Decided: no more documents.
  assert.equal((await sign(app, "crecom_chair", "denied")).status, 200);
  const closed = await addDocs(member.cookie, app, [{ fileName: "late.pdf", sha256 }]);
  assert.equal(closed.status, 409);
});

test("co-makers are asked again when the loan they vouched for changes", { skip }, async () => {
  const Setting = require("../src/models/Setting");
  const Member = require("../src/models/Member");
  await Setting.updateOne({ key: "loan" }, { $set: { coMakersRequired: 1, coMakersFromAmount: 0 } });
  await Member.create([{ memberId: "E-10", lastName: "Borrower", firstName: "Eve" }, { memberId: "E-11", lastName: "Backer", firstName: "Ed" }]);
  try {
    const borrower = await t.register("Eve Borrower", "eve@uedi.test");
    const backer = await t.register("Ed Backer", "ed@uedi.test");
    for (const [u, id] of [[borrower, "E-10"], [backer, "E-11"]]) {
      await t.call(`/auth/users/${u.id}/member`, { method: "PATCH", cookie: staff.officer.cookie, body: { memberId: id } });
    }
    const app = (await t.call("/applications", { method: "POST", cookie: borrower.cookie, body: { ...application(0), coMakers: ["E-11"] } })).json.application;
    assert.equal((await t.call(`/comaker/requests/${app._id}`, { method: "POST", cookie: backer.cookie, body: { decision: "accepted" } })).status, 200);

    // Only the reason changes: the co-maker's yes stands.
    const sameLoan = await edit(borrower.cookie, app, { coMakers: ["E-11"], loan: { purpose: "Tuition for my daughter" } });
    assert.equal(sameLoan.status, 200, sameLoan.json.error);
    assert.equal(sameLoan.json.application.coMakers[0].status, "accepted");

    // A bigger loan: they confirm again.
    const bigger = await edit(borrower.cookie, app, { coMakers: ["E-11"], loan: { amount: 100000 } });
    assert.equal(bigger.status, 200, bigger.json.error);
    assert.equal(bigger.json.application.coMakers[0].status, "pending");
  } finally {
    await Setting.updateOne({ key: "loan" }, { $set: { coMakersRequired: 0 } });
  }
});
