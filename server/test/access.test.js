// Integration test for what each level of account may see and do.
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

const link = (cookie, userId, memberId) =>
  t.call(`/auth/users/${userId}/member`, { method: "PATCH", cookie, body: { memberId } });

test("a member sees only their own loans and applications", { skip }, async () => {
  const mine = await releasedLoan(t, staff, { memberId: "M-0001", loan: { amount: 20000, termMonths: 12 } });
  const theirs = await releasedLoan(t, staff, { memberId: "M-0002", loan: { amount: 30000, termMonths: 12 } });
  const member = await t.register("Maria Member", "maria.member@uedi.test");

  // Not linked yet: nothing to see, and can't apply.
  assert.deepEqual((await t.call("/loans", { cookie: member.cookie })).json.loans, []);
  const early = await t.call("/applications", { method: "POST", cookie: member.cookie, body: application() });
  assert.equal(early.status, 403);
  assert.match(early.json.error, /linked/);

  // Members can't link themselves; a Loan Officer can.
  assert.equal((await link(member.cookie, member.id, "M-0002")).status, 403);
  assert.equal((await link(staff.officer.cookie, member.id, "M-0001")).status, 200);
  assert.equal((await t.call("/auth/me", { cookie: member.cookie })).json.session.memberId, "M-0001");

  const list = (await t.call("/loans", { cookie: member.cookie })).json.loans;
  assert.deepEqual(list.map((l) => l.loanNo), [mine.loanNo]);
  assert.equal((await t.call(`/loans/${mine._id}`, { cookie: member.cookie })).status, 200);
  assert.equal((await t.call(`/loans/${theirs._id}`, { cookie: member.cookie })).status, 404, "another member's loan is hidden");
  assert.equal((await t.call("/loans/balances?memberId=M-0001", { cookie: member.cookie })).status, 200);
  assert.equal((await t.call("/loans/balances?memberId=M-0002", { cookie: member.cookie })).status, 403);

  // Applying files under their own member ID, whatever the form says, with an empty Bookkeeper section.
  const body = application(0, { applicant: { memberId: "M-0002" }, bookkeeper: { longTermBalance: 99999, shortTermBalance: 99999 } });
  const applied = await t.call("/applications", { method: "POST", cookie: member.cookie, body });
  assert.equal(applied.status, 201);
  assert.equal(applied.json.application.applicant.memberId, "M-0001");
  assert.notEqual(applied.json.application.bookkeeper.longTermBalance, 99999);
  assert.equal(applied.json.application.assessment, undefined, "members don't see the internal ML scores");

  const apps = (await t.call("/applications", { cookie: member.cookie })).json.applications;
  assert.ok(apps.length >= 1);
  assert.ok(apps.every((a) => a.applicant.memberId === "M-0001"), "only their own applications");
  const all = (await t.call("/applications", { cookie: staff.officer.cookie })).json.applications;
  const other = all.find((a) => a.applicant.memberId === "M-0002");
  assert.equal((await t.call(`/applications/${other._id}`, { cookie: member.cookie })).status, 404);

  // Two accounts can't claim the same member record.
  const second = await t.register("Someone Else", "someone@uedi.test");
  assert.equal((await link(staff.officer.cookie, second.id, "M-0001")).status, 409);
});

test("staff pages and data are closed to the levels below them", { skip }, async () => {
  const member = await t.register("Plain Member", "plain@uedi.test");
  const as = (who, path, method = "GET") => t.call(path, { method, cookie: who.cookie }).then((r) => r.status);

  // Member: no staff data.
  assert.equal(await as(member, "/auth/users"), 403);
  assert.equal(await as(member, "/applications/model"), 403);
  assert.equal(await as(member, "/deductions"), 403);

  // Loan Officer: the user list (to link members) and the model card, not the benchmark or deductions.
  assert.equal(await as(staff.officer, "/auth/users"), 200);
  assert.equal(await as(staff.officer, "/deductions"), 403);
  assert.equal(await as(staff.officer, "/applications/model/benchmark"), 403);

  // President: still not the Credit Model benchmark; only admins.
  assert.equal(await as(staff.signer.president, "/applications/model/benchmark"), 403);
  assert.notEqual(await as(staff.admin, "/applications/model/benchmark"), 403);

  // Role changes stay admin-only, even for the top signers.
  const r = await t.call(`/auth/users/${member.id}/role`, { method: "PATCH", cookie: staff.signer.president.cookie, body: { role: "admin" } });
  assert.equal(r.status, 403);
});

test("profile edits and password change", { skip }, async () => {
  const member = await t.register("Pat Profile", "pat@uedi.test");
  const edit = await t.call("/auth/profile", { method: "PATCH", cookie: member.cookie, body: { fullName: "Patricia Profile", branch: "Main" } });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.session.fullName, "Patricia Profile");

  const wrong = await t.call("/auth/password", { method: "POST", cookie: member.cookie, body: { currentPassword: "nope1234", newPassword: "newpass123" } });
  assert.equal(wrong.status, 400);
  const weak = await t.call("/auth/password", { method: "POST", cookie: member.cookie, body: { currentPassword: "secret123", newPassword: "short" } });
  assert.equal(weak.status, 400);
  const ok = await t.call("/auth/password", { method: "POST", cookie: member.cookie, body: { currentPassword: "secret123", newPassword: "newpass123" } });
  assert.equal(ok.status, 200);
  const login = await t.call("/auth/login", { method: "POST", body: { email: "pat@uedi.test", password: "newpass123" } });
  assert.equal(login.status, 200);
});

test("carried-over spreadsheet balances: staff see all, a member only their own", { skip }, async () => {
  const Member = require("../src/models/Member");
  const opening = (balance) => ({ asOf: new Date("2026-09-30"), balanceStartOfYear: balance, appliedThisYear: 0, payments: 500_00, interest: 0, balance, loansThisYear: 0 });
  await Member.create({ memberId: "C-1", openingLoan: opening(10_000_00) });
  await Member.create({ memberId: "C-2", openingLoan: opening(25_000_00) });
  await Member.create({ memberId: "C-3" });

  const all = await t.call("/loans/carried", { cookie: staff.officer.cookie });
  assert.equal(all.status, 200);
  assert.deepEqual(all.json.carried.map((c) => c.memberId), ["C-1", "C-2"]);
  assert.equal(all.json.carried[0].fullName, "Member No. C-1");
  assert.equal(all.json.carried[1].balance, 25_000_00);

  const member = await t.register("Carla Member", "carla.member@uedi.test");
  assert.deepEqual((await t.call("/loans/carried", { cookie: member.cookie })).json.carried, [], "unlinked: nothing");
  await link(staff.officer.cookie, member.id, "C-2");
  const own = await t.call("/loans/carried", { cookie: member.cookie });
  assert.deepEqual(own.json.carried.map((c) => c.memberId), ["C-2"]);
});

test("the Bookkeeper sets a payroll deduction on a carried-over balance; runs then include it", { skip }, async () => {
  const Member = require("../src/models/Member");
  await Member.create({
    memberId: "D-1",
    openingLoan: { asOf: new Date("2026-09-30"), balanceStartOfYear: 10_000_00, appliedThisYear: 0, payments: 0, interest: 0, balance: 10_000_00, loansThisYear: 0 },
  });
  const body = { perCutoff: 1_500_00, paymentFrequency: "quincenal", firstDueDate: "2026-10-15" };
  const bk = staff.signer.bookkeeper.cookie;
  const setUp = (cookie, b = body) => t.call("/members/D-1/payroll-deduction", { method: "POST", cookie, body: b });

  assert.equal((await setUp(staff.officer.cookie)).status, 403, "loan officers can't");
  assert.equal((await setUp(bk, { ...body, firstDueDate: "2026-10-14" })).status, 400, "not a cutoff");
  assert.equal((await setUp(bk, { ...body, paymentFrequency: "monthly" })).status, 400, "monthly runs at month-end only");
  assert.equal((await setUp(bk, { ...body, firstDueDate: "2026-09-15" })).status, 400, "before the ledger balance");

  const r = await setUp(bk);
  assert.equal(r.status, 201, r.json.error);
  const loan = r.json.loan;
  assert.equal(loan.loanNo, "LEDGER-D-1");
  assert.equal(loan.source, "ledger");
  assert.equal(loan.schedule.length, 7, "6 x 1,500 + 1,000");
  assert.equal(loan.schedule[6].totalDue, 1_000_00);
  assert.equal(loan.totalPayable, 10_000_00, "no interest added");
  assert.equal(loan.schedule[0].dueDate.slice(0, 10), "2026-10-15");
  assert.equal(loan.schedule[1].dueDate.slice(0, 10), "2026-10-31");
  assert.equal((await setUp(bk)).status, 409, "only once");

  const carried = (await t.call("/loans/carried", { cookie: bk })).json.carried;
  assert.ok(!carried.some((c) => c.memberId === "D-1"), "no longer listed as carried over");
  const row = (await t.call("/members", { cookie: bk })).json.members.find((m) => m.memberId === "D-1");
  assert.equal(row.loanBalance, 10_000_00, "counted once");
  assert.equal(row.ledgerLoan.loanNo, "LEDGER-D-1");

  const run = (await t.call("/deductions", { method: "POST", cookie: bk, body: { cutoffDate: "2026-10-15" } })).json.run;
  assert.equal(run.lines.find((l) => l.loanNo === "LEDGER-D-1")?.expected, 1_500_00);
});

test("a linked member gets their own record to fill in the loan form, and nobody else's", { skip }, async () => {
  const Member = require("../src/models/Member");
  await Member.create({ memberId: "F-1", lastName: "Garcia", firstName: "Paolo", residenceAddress: "Purok 1, Tagum City", employer: "DNSC", employmentStatus: "permanent", joinedAt: new Date("2015-03-01") });
  const member = await t.register("Paolo Garcia", "paolo@uedi.test");
  assert.deepEqual((await t.call("/members/mine", { cookie: member.cookie })).json, { member: null }, "not linked yet");
  await link(staff.officer.cookie, member.id, "F-1");
  await t.call("/applications", { method: "POST", cookie: member.cookie, body: application(0, { applicant: { monthlySalary: 41000, netTakeHomePay: 27000 } }) });

  const mine = (await t.call("/members/mine", { cookie: member.cookie })).json;
  assert.equal(mine.member.memberId, "F-1");
  assert.equal(mine.member.residenceAddress, "Purok 1, Tagum City");
  assert.ok(mine.history.yearsAsMember >= 11);
  assert.equal(mine.lastApplication.monthlySalary, 41000);
  assert.equal((await t.call("/members/F-1", { cookie: member.cookie })).status, 403, "still can't read member records");
});
