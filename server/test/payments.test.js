// Payments outside payroll (cash, e-money, bank transfer): member or office submits → Treasurer
// receives with an OR → Bookkeeper confirms, which posts exactly one Payment. Plus the advance rule:
// the next payroll run still expects the full installment.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { uri, setup, staffUp, releasedLoan, daysAgo } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let staff;
let loan;
let member;
let stranger;

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082", "hex");

before(async () => {
  if (!uri) return;
  t = await setup();
  staff = await staffUp(t);
  // Monthly, released 70 days ago: two installments already fell due.
  loan = await releasedLoan(t, staff, { memberId: "M-0500", releasedAt: daysAgo(70), loan: { amount: 30000, termMonths: 12, paymentFrequency: "monthly" } });
  member = await t.register("Pia Payer", "pia@uedi.test");
  const linked = await t.call(`/auth/users/${member.id}/member`, { method: "PATCH", cookie: staff.admin.cookie, body: { memberId: "M-0500" } });
  assert.equal(linked.status, 200, linked.json.error);
  stranger = await t.register("Sam Stranger", "sam@uedi.test");
});

after(async () => {
  if (uri) await t.close();
});

const tr = () => staff.signer.treasurer.cookie;
const bk = () => staff.signer.bookkeeper.cookie;
const as = (who, path, opts = {}) => t.call(path, { cookie: who, ...opts });
const post = (who, path, body) => as(who, path, { method: "POST", body });
const loanNow = async () => (await as(bk(), `/loans/${loan._id}`)).json;

async function upload(cookie, id, buf = PNG, type = "image/png") {
  const res = await fetch(`${t.baseUrl}/payments/${id}/proof?name=gcash.png`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": type }, body: buf });
  return { status: res.status, json: await res.json() };
}

test("member e-money submission → Treasurer receives with OR → Bookkeeper confirms: one Payment, lower balance", { skip }, async () => {
  const startBalance = (await loanNow()).loan.balance;
  const base = { loanId: loan._id, amount: 50_000, method: "e_money", paidAt: daysAgo(1) };

  assert.equal((await post(member.cookie, "/payments", { ...base, reference: undefined })).status, 400, "e-money needs a reference");
  assert.equal((await post(stranger.cookie, "/payments", { ...base, reference: "GC-1" })).status, 404, "only the borrower");
  assert.equal((await post(member.cookie, "/payments", { ...base, reference: "GC-1", paidAt: daysAgo(-2) })).status, 400, "not in the future");
  const created = await post(member.cookie, "/payments", { ...base, reference: "GCASH-778812" });
  assert.equal(created.status, 201, created.json.error);
  const sub = created.json.submission;
  assert.equal(sub.status, "submitted");
  assert.equal(sub.source, "member");
  assert.equal(sub.methodLabel, "E-money");

  // Proof first: the Treasurer can't receive a transfer the member hasn't shown.
  assert.equal((await post(tr(), `/payments/${sub._id}/receive`, { orNumber: "OR-5001", receivedAt: daysAgo(0) })).status, 409, "no proof yet");
  assert.equal((await upload(stranger.cookie, sub._id)).status, 404);
  const proof = await upload(member.cookie, sub._id);
  assert.equal(proof.status, 200, proof.json.error);
  assert.equal(proof.json.submission.proof.fileName, "gcash.png");
  const file = await fetch(`${t.baseUrl}/payments/${sub._id}/proof`, { headers: { Cookie: tr() } });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");

  // Nothing is posted before the Bookkeeper confirms.
  assert.equal((await post(bk(), `/payments/${sub._id}/receive`, { orNumber: "OR-5001", receivedAt: daysAgo(0) })).status, 403, "a Bookkeeper can't receive");
  assert.equal((await post(bk(), `/payments/${sub._id}/confirm`)).status, 409, "not received yet");
  const received = await post(tr(), `/payments/${sub._id}/receive`, { orNumber: "OR-5001", receivedAt: daysAgo(0) });
  assert.equal(received.status, 200, received.json.error);
  assert.equal(received.json.submission.status, "received");
  assert.equal(received.json.submission.received.orNumber, "OR-5001");
  assert.equal(received.json.submission.received.byName, "Test treasurer");
  let now = await loanNow();
  assert.equal(now.loan.balance, startBalance, "received is not posted");
  assert.equal(now.payments.length, 0);
  assert.equal((await upload(member.cookie, sub._id)).status, 409, "proof is locked once received");

  assert.equal((await post(tr(), `/payments/${sub._id}/confirm`)).status, 403, "a Treasurer can't confirm");
  const confirmed = await post(bk(), `/payments/${sub._id}/confirm`);
  assert.equal(confirmed.status, 200, confirmed.json.error);
  assert.equal(confirmed.json.submission.status, "posted");
  assert.equal(confirmed.json.submission.confirmed.byName, "Test bookkeeper");
  assert.equal((await post(bk(), `/payments/${sub._id}/confirm`)).status, 409, "only once");

  now = await loanNow();
  assert.equal(now.payments.length, 1, "exactly one Payment");
  const [p] = now.payments;
  assert.deepEqual([p.method, p.orNumber, p.reference, p.amount, p.paymentSubmission], ["e_money", "OR-5001", "GCASH-778812", 50_000, sub._id]);
  assert.equal(now.loan.balance, startBalance - 50_000);

  const { outbox } = require("../src/services/mailer");
  assert.ok(outbox.some((m) => m.to === "pia@uedi.test" && /was posted/.test(m.subject)), "the member is emailed");

  const mine = await as(member.cookie, `/payments/mine?loan=${loan._id}`);
  assert.deepEqual(mine.json.submissions.map((s) => s.status), ["posted"]);
  const list = await as(tr(), "/payments?status=posted");
  assert.equal(list.json.submissions.length, 1);
  assert.equal((await as(staff.officer.cookie, "/payments")).status, 403, "loan officers don't see the Payments list");

  // Voiding the posted payment goes through the loan's void route and is noted on the submission.
  const voided = await post(bk(), `/loans/${loan._id}/payments/${p._id}/void`, { reason: "Transfer bounced back." });
  assert.equal(voided.status, 200, voided.json.error);
  const after = (await as(tr(), `/payments/${sub._id}`)).json.submission;
  assert.equal(after.status, "posted");
  assert.equal(after.voided.reason, "Transfer bounced back.");
  assert.equal((await loanNow()).loan.balance, startBalance);
});

test("OR numbers are unique; rejecting at each step; the balance limit at confirm", { skip }, async () => {
  const walkIn = (body) => post(tr(), "/payments", { loanId: loan._id, method: "cash", paidAt: daysAgo(0), ...body });
  const a = (await walkIn({ amount: 10_000 })).json.submission;
  assert.equal(a.source, "office");
  const b = (await walkIn({ amount: 20_000 })).json.submission;
  assert.equal((await post(tr(), `/payments/${a._id}/receive`, { orNumber: "OR-5001", receivedAt: daysAgo(0) })).status, 409, "OR-5001 was used above");
  assert.equal((await post(tr(), `/payments/${a._id}/receive`, { orNumber: "", receivedAt: daysAgo(0) })).status, 400, "OR required");
  assert.equal((await post(tr(), `/payments/${a._id}/receive`, { orNumber: "OR-5002", receivedAt: daysAgo(0) })).status, 200);
  const dup = await post(tr(), `/payments/${b._id}/receive`, { orNumber: "OR-5002", receivedAt: daysAgo(0) });
  assert.equal(dup.status, 409);
  assert.match(dup.json.error, /OR-5002 was already used/);

  // The Treasurer rejects before receiving, the Bookkeeper after; a reason is required.
  assert.equal((await post(bk(), `/payments/${b._id}/reject`, { reason: "No money" })).status, 403, "the Bookkeeper rejects only received payments");
  assert.equal((await post(tr(), `/payments/${b._id}/reject`, { reason: "" })).status, 400);
  const rb = await post(tr(), `/payments/${b._id}/reject`, { reason: "Nothing came in." });
  assert.equal(rb.status, 200, rb.json.error);
  assert.equal(rb.json.submission.status, "rejected");
  assert.equal((await post(tr(), `/payments/${a._id}/reject`, { reason: "Too late" })).status, 403, "the Treasurer can't reject once received");
  const ra = await post(bk(), `/payments/${a._id}/reject`, { reason: "Wrong loan; refunded." });
  assert.equal(ra.status, 200, ra.json.error);
  assert.equal((await post(bk(), `/payments/${a._id}/confirm`)).status, 409, "rejected stays rejected");

  // More than the balance at confirm time: 409, and it stays received.
  const balance = (await loanNow()).loan.balance;
  const big = (await walkIn({ amount: balance - 1000 })).json.submission;
  const small = (await walkIn({ amount: 2000 })).json.submission;
  await post(tr(), `/payments/${big._id}/receive`, { orNumber: "OR-5003", receivedAt: daysAgo(0) });
  await post(tr(), `/payments/${small._id}/receive`, { orNumber: "OR-5004", receivedAt: daysAgo(0) });
  assert.equal((await post(bk(), `/payments/${big._id}/confirm`)).status, 200);
  const over = await post(bk(), `/payments/${small._id}/confirm`);
  assert.equal(over.status, 409);
  assert.match(over.json.error, /more than the remaining balance/);
  assert.equal((await as(tr(), `/payments/${small._id}`)).json.submission.status, "received");
  await post(bk(), `/payments/${small._id}/reject`, { reason: "Over the balance; refunded." });
  // Undo for the next test.
  const pay = (await loanNow()).payments.find((p) => p.orNumber === "OR-5003");
  await post(bk(), `/loans/${loan._id}/payments/${pay._id}/void`, { reason: "Test cleanup" });

  const counts = (await as(tr(), "/payments/counts")).json;
  assert.deepEqual(counts, { submitted: 0, received: 0 });
});

test("the direct loan route refuses cash, e-money and bank transfers", { skip }, async () => {
  for (const method of ["cash", "e_money", "bank_transfer"]) {
    const r = await post(bk(), `/loans/${loan._id}/payments`, { amount: 1000, paidAt: daysAgo(0), method });
    assert.equal(r.status, 400, method);
    assert.match(r.json.error, /Payments page/);
  }
  assert.equal((await post(bk(), `/loans/${loan._id}/payments`, { amount: 1000, paidAt: daysAgo(0), method: "other" })).status, 201);
});

test("an advance doesn't change the next payroll deduction", { skip }, async () => {
  const before = (await loanNow()).loan;
  const next = before.schedule.find((x) => new Date(x.dueDate) > new Date(`${daysAgo(0)}T00:00:00Z`));
  const sub = (await post(tr(), "/payments", { loanId: loan._id, method: "bank_transfer", reference: "BDO-1", amount: next.totalDue + before.pastDueAmount, paidAt: daysAgo(0) })).json.submission;
  await post(tr(), `/payments/${sub._id}/receive`, { orNumber: "OR-5005", receivedAt: daysAgo(0) });
  const posted = await post(bk(), `/payments/${sub._id}/confirm`);
  assert.equal(posted.status, 200, posted.json.error);
  const l = posted.json.loan;
  assert.equal(l.pastDue, false);
  assert.equal(l.paidAhead.count, 1, "the next installment is paid ahead");

  const run = await post(bk(), "/deductions", { cutoffDate: next.dueDate.slice(0, 10) });
  assert.equal(run.status, 201, run.json.error);
  const line = run.json.run.lines.find((x) => x.loanNo === loan.loanNo);
  assert.ok(line, "still on the run");
  assert.equal(line.expected, next.totalDue, "the full installment, not zero");
  assert.equal(line.arrears, 0);
});
