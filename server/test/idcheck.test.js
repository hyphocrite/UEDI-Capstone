// The ID name check: a verified ID passes; otherwise the Bookkeeper compares the ID with the
// applicant's name by hand when signing.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, application, requiredDocuments, staffUp } = require("./helpers");

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

/** Files an application whose valid ID has this verdict (undefined: no verdict, as from the phone). */
async function fileWithId(verdict) {
  const documents = requiredDocuments().map((d) => (d.type === "valid_id" ? { ...d, verdict, readName: "MARIA C SANTOS" } : d));
  const r = await t.call("/applications", { method: "POST", cookie: staff.officer.cookie, body: { ...application(0), documents } });
  assert.equal(r.status, 201, r.json.error);
  return r.json.application;
}
const bookkeeperSigns = (app, body) => t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer.bookkeeper.cookie, body });

test("a verified ID lets the Bookkeeper sign without comparing it", { skip }, async () => {
  const app = await fileWithId("verified");
  assert.equal(app.idCheck.state, "passed");
  const signed = await bookkeeperSigns(app, { decision: "approved" });
  assert.equal(signed.status, 200, signed.json.error);
});

test("an ID the OCR flagged needs the Bookkeeper's tick; Doesn't match blocks approving but not denying", { skip }, async () => {
  const app = await fileWithId("mismatch");
  assert.equal(app.idCheck.state, "needs_check");
  assert.equal(app.documents.find((d) => d.type === "valid_id").readName, "MARIA C SANTOS");

  const untick = await bookkeeperSigns(app, { decision: "approved" });
  assert.equal(untick.status, 400);
  assert.equal(untick.json.code, "ID_CHECK_NEEDED");
  assert.equal((await bookkeeperSigns(app, { decision: "denied", note: "Wrong ID" })).json.code, "ID_CHECK_NEEDED", "a denial needs the tick too");
  assert.equal((await bookkeeperSigns(app, { decision: "approved", idCheck: { result: "mismatch" } })).status, 400, "Doesn't match needs a note");
  const approveMismatch = await bookkeeperSigns(app, { decision: "approved", note: "Approving", idCheck: { result: "mismatch", note: "ID says Mario" } });
  assert.equal(approveMismatch.status, 400);
  assert.equal(approveMismatch.json.error, "The ID name doesn't match the applicant. Ask for a correct ID or deny.");

  const denied = await bookkeeperSigns(app, { decision: "denied", note: "Wrong person on the ID", idCheck: { result: "mismatch", note: "ID says Mario" } });
  assert.equal(denied.status, 200, denied.json.error);
  assert.equal(denied.json.application.idCheck.manual.result, "mismatch");
  assert.equal(denied.json.application.idCheck.state, "mismatch");
});

test("Matches by hand lets the Bookkeeper approve, and the others don't compare it again", { skip }, async () => {
  const app = await fileWithId("review");
  const signed = await bookkeeperSigns(app, { decision: "approved", idCheck: { result: "matches" } });
  assert.equal(signed.status, 200, signed.json.error);
  assert.equal(signed.json.application.idCheck.state, "checked");
  assert.equal(signed.json.application.idCheck.manual.byName, "Test bookkeeper");
  const crecom = await t.call(`/applications/${app._id}/approvals`, { method: "POST", cookie: staff.signer.crecom_chair.cookie, body: { decision: "approved", idCheck: { result: "matches" } } });
  assert.equal(crecom.status, 400, "only the Bookkeeper compares the ID");
});

test("an ID without a verdict needs a check, and a verified ID added later settles it", { skip }, async () => {
  const app = await fileWithId(undefined);
  assert.equal(app.idCheck.status, "needs_check");
  assert.equal((await bookkeeperSigns(app, { decision: "approved" })).json.code, "ID_CHECK_NEEDED");

  // The officer filed it, so the officer adds the clearer ID.
  const added = await t.call(`/applications/${app._id}/documents`, {
    method: "POST",
    cookie: staff.officer.cookie,
    body: { documents: [{ fileName: "id-clear.jpg", type: "valid_id", verdict: "verified" }] },
  });
  assert.equal(added.status, 201, added.json.error);
  assert.equal(added.json.application.idCheck.status, "passed");
  assert.equal((await bookkeeperSigns(app, { decision: "approved" })).status, 200);
});
