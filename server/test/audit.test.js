// Audit log: every change is recorded, secrets are left out, and only administrators can read it.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, staffUp, approve } = require("./helpers");

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

/** Entries are written once the response is sent, so give them a moment. */
async function entries(query = "") {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const r = await t.call(`/audit${query}`, { cookie: staff.admin.cookie });
    assert.equal(r.status, 200, r.json.error);
    if (r.json.entries.length) return r.json;
  }
  return { entries: [], total: 0 };
}

test("only administrators can read the audit log, and it can't be changed", { skip }, async () => {
  for (const who of [staff.officer, staff.signer.treasurer, staff.signer.president]) {
    assert.equal((await t.call("/audit", { cookie: who.cookie })).status, 403);
  }
  assert.equal((await t.call("/audit")).status, 401);
  assert.equal((await t.call("/audit", { cookie: staff.admin.cookie })).status, 200);
  // There are no routes to add, change or delete entries, even for an administrator.
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((await t.call("/audit", { method, cookie: staff.admin.cookie, body: {} })).status, 404, method);
  }
});

test("sign-ins are logged, failed ones too, without the password", { skip }, async () => {
  await t.call("/auth/login", { method: "POST", body: { email: "admin@uedi.test", password: "wrong-pass1" } });
  const { entries: list } = await entries("?action=Signed%20in&outcome=failed");
  const failed = list.find((e) => e.userEmail === "admin@uedi.test");
  assert.ok(failed, "failed sign-in recorded");
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 401);
  assert.equal(failed.details.password, "[removed]");
  assert.match(failed.error, /Invalid email or password/);
});

test("approvals, denials and role changes are logged with who, what and the record", { skip }, async () => {
  const approved = await approve(t, staff, application(0));
  const app = (await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: application(0) })).json.application;
  await t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body: { decision: "denied", note: "Incomplete papers" } });

  const signed = (await entries("?q=" + encodeURIComponent(approved.applicationNo))).entries;
  assert.deepEqual(
    signed.filter((e) => e.action.startsWith("Application approved")).map((e) => e.role).sort(),
    ["bookkeeper", "crecom_chair", "president", "treasurer"],
  );
  const final = signed.find((e) => e.action === "Application approved (final, loan created)");
  assert.equal(final.details.result, "approved");
  assert.ok(final.details.loanNo);

  const denied = (await entries("?action=Application%20denied")).entries[0];
  assert.equal(denied.userName, "Test bookkeeper");
  assert.match(denied.target, new RegExp(app.applicationNo));
  assert.equal(denied.details.note, "Incomplete papers");

  const u = await t.register("Rita Role", "rita@uedi.test");
  await t.call(`/auth/users/${u.id}/role`, { method: "PATCH", cookie: staff.admin.cookie, body: { role: "treasurer" } });
  const role = (await entries("?q=rita%40uedi.test&action=Role%20changed")).entries[0];
  assert.deepEqual(role.before, { role: "staff" });
  assert.equal(role.details.role, "treasurer");
  assert.equal(role.role, "admin");

  const verified = (await entries("?q=rita%40uedi.test&action=Email%20verified")).entries[0];
  assert.equal(verified.details.code, "[removed]", "verification codes are not kept");
});
