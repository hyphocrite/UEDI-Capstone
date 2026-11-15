// Integration test for account creation, email verification and login.
// Needs a running MongoDB: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { uri, lastCode } = require("./helpers"); // sets the test env before the app loads
const { createApp } = require("../src/app");

let server;
let base;

before(async () => {
  if (!uri) return;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!uri) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  server.close();
});

async function call(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json(), setCookie: res.headers.get("set-cookie") };
}

const post = (path, body, cookie) => call(path, { method: "POST", body, cookie });

test("register, verify email, session, duplicate, login, logout", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const account = { fullName: "Maria Santos", email: "Maria@UEDI.coop", password: "secret123" };

  const bad = await post("/auth/register", { ...account, password: "short" });
  assert.equal(bad.status, 400);

  const reg = await post("/auth/register", account);
  assert.equal(reg.status, 201);
  assert.equal(reg.json.verificationRequired, true);
  assert.equal(reg.json.email, "maria@uedi.coop");
  assert.equal(reg.setCookie, null, "no session before the email is verified");

  const early = await post("/auth/login", { email: account.email, password: account.password });
  assert.equal(early.status, 403);
  assert.equal(early.json.code, "EMAIL_NOT_VERIFIED");

  const code = lastCode(account.email);
  assert.match(code, /^\d{6}$/);
  const stored = await mongoose.connection.collection("users").findOne({ email: "maria@uedi.coop" });
  assert.notEqual(stored.emailVerification.codeHash, code, "code is stored hashed");

  const wrongCode = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  assert.equal((await post("/auth/verify-email", { email: account.email, code: wrongCode })).status, 400);

  const verified = await post("/auth/verify-email", { email: account.email, code });
  assert.equal(verified.status, 200);
  assert.equal(verified.json.session.role, "admin", "first account is admin");
  assert.match(verified.setCookie, /uedi_session=.+HttpOnly/i);
  const cookie = verified.setCookie.split(";")[0];

  const reused = await post("/auth/verify-email", { email: account.email, code });
  assert.equal(reused.status, 400, "a code works once");

  const me = await call("/auth/me", { cookie });
  assert.equal(me.json.session.fullName, "Maria Santos");

  const dup = await post("/auth/register", account);
  assert.equal(dup.status, 409);

  await post("/auth/register", { fullName: "Jose Reyes", email: "jose@uedi.coop", password: "secret456" });
  const second = await post("/auth/verify-email", { email: "jose@uedi.coop", code: lastCode("jose@uedi.coop") });
  assert.equal(second.json.session.role, "staff");

  const wrong = await post("/auth/login", { email: account.email, password: "nope1234" });
  assert.equal(wrong.status, 401);
  const unknown = await post("/auth/login", { email: "nobody@uedi.coop", password: "nope1234" });
  assert.equal(unknown.status, 401);

  const login = await post("/auth/login", { email: account.email, password: account.password });
  assert.equal(login.status, 200);

  const saved = await mongoose.connection.collection("users").findOne({ email: "maria@uedi.coop" });
  assert.ok(saved.passwordHash.startsWith("$2"), "password is hashed");
  assert.notEqual(saved.passwordHash, account.password);
  assert.equal(saved.emailVerified, true);
  assert.equal(saved.emailVerification, undefined, "code is cleared once used");

  const users = await call("/auth/users", { cookie });
  assert.equal(users.json.users.length, 2);

  const anon = await call("/auth/users");
  assert.equal(anon.status, 401);

  const out = await post("/auth/logout", undefined, cookie);
  assert.equal(out.status, 200);
});

test("a code is used up after five wrong guesses; resend gives a new one", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const email = "ana@uedi.coop";
  await post("/auth/register", { fullName: "Ana Cruz", email, password: "secret789" });
  const code = lastCode(email);
  const wrongCode = String((Number(code) + 1) % 1_000_000).padStart(6, "0");

  for (let i = 0; i < 5; i++) await post("/auth/verify-email", { email, code: wrongCode });
  const blocked = await post("/auth/verify-email", { email, code });
  assert.equal(blocked.status, 400, "the right code no longer works");
  assert.match(blocked.json.error, /expired|too many/i);

  // Resend answers the same way for unknown emails.
  assert.equal((await post("/auth/resend-verification", { email: "ghost@uedi.coop" })).status, 200);

  // Let the resend cooldown pass.
  await mongoose.connection.collection("users").updateOne({ email }, { $set: { "emailVerification.sentAt": new Date(0) } });
  assert.equal((await post("/auth/resend-verification", { email })).status, 200);
  const fresh = lastCode(email);
  const ok = await post("/auth/verify-email", { email, code: fresh });
  assert.equal(ok.status, 200);
});

test("accounts made before verification existed can still sign in", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const bcrypt = require("bcryptjs");
  await mongoose.connection.collection("users").insertOne({
    fullName: "Old Account",
    email: "old@uedi.coop",
    passwordHash: await bcrypt.hash("secret123", 4),
    role: "staff",
  });
  const login = await post("/auth/login", { email: "old@uedi.coop", password: "secret123" });
  assert.equal(login.status, 200);
});

test("forgot password: emailed code, new password, old sessions end", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const email = "rosa@uedi.coop";
  await post("/auth/register", { fullName: "Rosa Lim", email, password: "oldpass123" });
  const signedIn = await post("/auth/verify-email", { email, code: lastCode(email) });
  const oldCookie = signedIn.setCookie.split(";")[0];

  // Same answer for unknown emails, and no mail goes out for them.
  const { outbox } = require("../src/services/mailer");
  const before = outbox.length;
  assert.equal((await post("/auth/forgot-password", { email: "nobody@uedi.coop" })).status, 200);
  assert.equal(outbox.length, before);

  assert.equal((await post("/auth/forgot-password", { email })).status, 200);
  assert.match(outbox.at(-1).subject, /password reset code/i);
  const code = lastCode(email);

  // Asking again within a minute doesn't send another code.
  await post("/auth/forgot-password", { email });
  assert.equal(lastCode(email), code);

  const weak = await post("/auth/reset-password", { email, code, newPassword: "short" });
  assert.equal(weak.status, 400, "the new password must follow the same rules as sign-up");

  const wrongCode = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  const wrong = await post("/auth/reset-password", { email, code: wrongCode, newPassword: "newpass456" });
  assert.equal(wrong.status, 400);
  assert.match(wrong.json.error, /not correct/);

  // Session times are whole seconds: start the reset in a later second than the old sign-in.
  await new Promise((r) => setTimeout(r, 1100));
  const reset = await post("/auth/reset-password", { email, code, newPassword: "newpass456" });
  assert.equal(reset.status, 200);
  assert.equal(reset.json.session.email, email);
  assert.ok(reset.setCookie, "signed in after the reset");

  assert.equal((await post("/auth/reset-password", { email, code, newPassword: "another789" })).status, 400, "a code works once");
  assert.equal((await call("/auth/me", { cookie: oldCookie })).json.session, null, "sessions from before the reset end");
  assert.equal((await post("/auth/login", { email, password: "oldpass123" })).status, 401);
  assert.equal((await post("/auth/login", { email, password: "newpass456" })).status, 200);
});

test("a reset code is used up after five wrong guesses", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const email = "ben@uedi.coop";
  await post("/auth/register", { fullName: "Ben Ramos", email, password: "secret123" });
  await post("/auth/verify-email", { email, code: lastCode(email) });
  await post("/auth/forgot-password", { email });
  const code = lastCode(email);
  const wrongCode = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  for (let i = 0; i < 5; i++) await post("/auth/reset-password", { email, code: wrongCode, newPassword: "newpass456" });
  const blocked = await post("/auth/reset-password", { email, code, newPassword: "newpass456" });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /expired|too many/i);
});

test("a reset also verifies an account that never entered its sign-up code", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const email = "carla@uedi.coop";
  await post("/auth/register", { fullName: "Carla Diaz", email, password: "secret123" });
  await post("/auth/forgot-password", { email });
  const reset = await post("/auth/reset-password", { email, code: lastCode(email), newPassword: "newpass456" });
  assert.equal(reset.status, 200);
  assert.equal((await post("/auth/login", { email, password: "newpass456" })).status, 200);
});
