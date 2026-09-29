// Integration test for account creation and login.
// Needs a running MongoDB: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createApp } = require("../src/app");

const uri = process.env.TEST_MONGODB_URI;
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

test("register, session, duplicate, login, logout", { skip: !uri && "TEST_MONGODB_URI not set" }, async () => {
  const account = { fullName: "Maria Santos", email: "Maria@UEDI.coop", password: "secret123" };

  const bad = await call("/auth/register", { method: "POST", body: { ...account, password: "short" } });
  assert.equal(bad.status, 400);

  const reg = await call("/auth/register", { method: "POST", body: account });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.session.email, "maria@uedi.coop");
  assert.equal(reg.json.session.role, "admin", "first account is admin");
  assert.match(reg.setCookie, /uedi_session=.+HttpOnly/i);
  const cookie = reg.setCookie.split(";")[0];

  const me = await call("/auth/me", { cookie });
  assert.equal(me.json.session.fullName, "Maria Santos");

  const dup = await call("/auth/register", { method: "POST", body: account });
  assert.equal(dup.status, 409);

  const second = await call("/auth/register", {
    method: "POST",
    body: { fullName: "Jose Reyes", email: "jose@uedi.coop", password: "secret456" },
  });
  assert.equal(second.json.session.role, "staff");

  const wrong = await call("/auth/login", { method: "POST", body: { email: account.email, password: "nope1234" } });
  assert.equal(wrong.status, 401);

  const login = await call("/auth/login", { method: "POST", body: { email: account.email, password: account.password } });
  assert.equal(login.status, 200);

  const stored = await mongoose.connection.collection("users").findOne({ email: "maria@uedi.coop" });
  assert.ok(stored.passwordHash.startsWith("$2"), "password is hashed");
  assert.notEqual(stored.passwordHash, account.password);

  const users = await call("/auth/users", { cookie });
  assert.equal(users.json.users.length, 2);

  const anon = await call("/auth/users");
  assert.equal(anon.status, 401);

  const out = await call("/auth/logout", { method: "POST", cookie });
  assert.equal(out.status, 200);
});
