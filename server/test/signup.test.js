// Sign-up: one kind of member account on web and mobile, no admin from the open web sign-up in
// production, no role through the body; and trust proxy for the rate limits.
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/uedi_test npm test
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const express = require("express");
const { uri, setup, lastCode } = require("./helpers");

const skip = !uri && "TEST_MONGODB_URI not set";
let t;
let env;
let User;

before(async () => {
  if (!uri) return;
  t = await setup();
  env = require("../src/config/env");
  User = require("../src/models/User");
});

after(async () => {
  if (uri) await t.close();
});

const body = (name, email, extra = {}) => ({ fullName: name, email, password: "secret123", privacyConsent: true, ...extra });

test("without ALLOW_FIRST_ADMIN the first web sign-up is a member, not the administrator", { skip }, async () => {
  const was = env.allowFirstAdmin;
  env.allowFirstAdmin = false;
  try {
    assert.equal(await User.estimatedDocumentCount(), 0);
    assert.equal((await t.call("/auth/register", { method: "POST", body: body("First Person", "first@uedi.test") })).status, 201);
    assert.equal((await User.findOne({ email: "first@uedi.test" })).role, "staff");
  } finally {
    env.allowFirstAdmin = was;
  }
});

test("/register can't set a role through the body", { skip }, async () => {
  const r = await t.call("/auth/register", { method: "POST", body: body("Sneaky Sam", "sam@uedi.test", { role: "admin" }) });
  assert.equal(r.status, 201);
  assert.equal((await User.findOne({ email: "sam@uedi.test" })).role, "staff");
  const m = await t.call("/member/register", { method: "POST", body: body("Sneaky Mo", "mo@uedi.test", { memberNo: "S-1", role: "treasurer" }) });
  assert.equal(m.status, 201);
  assert.equal((await User.findOne({ email: "mo@uedi.test" })).role, "staff");
});

test("web and mobile sign-ups are the same kind of account and can use both", { skip }, async () => {
  await t.call("/member/verify-email", { method: "POST", body: { email: "mo@uedi.test", code: lastCode("mo@uedi.test") } });
  const mobile = await t.call("/member/login", { method: "POST", body: { email: "mo@uedi.test", password: "secret123" } });
  assert.equal(mobile.status, 200, mobile.json.error);
  assert.equal(mobile.json.session.role, "staff");
  const web = await t.call("/auth/login", { method: "POST", body: { email: "mo@uedi.test", password: "secret123" } });
  assert.equal(web.status, 200, "a phone sign-up can sign in on the web too");

  // An older mobile account (role "member") is treated the same, and shown as the member role.
  await User.updateOne({ email: "mo@uedi.test" }, { $set: { role: "member" } });
  const again = await t.call("/member/login", { method: "POST", body: { email: "mo@uedi.test", password: "secret123" } });
  assert.equal(again.json.session.role, "staff");
  const cookie = (await t.call("/auth/login", { method: "POST", body: { email: "mo@uedi.test", password: "secret123" } })).setCookie.split(";")[0];
  assert.equal((await t.call("/loans", { cookie })).status, 200, "the web member pages work");
  assert.equal((await t.call("/payments", { cookie })).status, 403, "but not office pages");
});

test("trust proxy: two client IPs behind the proxy don't share a rate limit", { skip }, async () => {
  assert.equal(require("../src/app").createApp().get("trust proxy"), env.trustProxy, "app.js applies TRUST_PROXY");
  const { rateLimit } = require("../src/middleware/rateLimit");
  const was = env.authRateLimit;
  env.authRateLimit = true;
  const app = express();
  app.set("trust proxy", 1);
  app.post("/x", rateLimit({ windowMs: 60_000, max: 1, message: "Too many." }), (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const hit = (ip) => fetch(`http://127.0.0.1:${server.address().port}/x`, { method: "POST", headers: { "X-Forwarded-For": ip } }).then((r) => r.status);
    assert.equal(await hit("203.0.113.1"), 200);
    assert.equal(await hit("203.0.113.2"), 200, "another client is not limited by the first");
    assert.equal(await hit("203.0.113.1"), 429, "the same client is");
  } finally {
    env.authRateLimit = was;
    server.close();
  }

});
