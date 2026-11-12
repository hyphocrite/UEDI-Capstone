// Mailer: Brevo's HTTPS API is used when BREVO_API_KEY is set (for Render's free tier, which blocks SMTP).
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("sends through Brevo's API with the MAIL_FROM sender", async () => {
  process.env.BREVO_API_KEY = "test-key";
  process.env.MAIL_FROM = "UDEI Loans <udei.loans@gmail.com>";
  delete require.cache[require.resolve("../src/config/env")];
  delete require.cache[require.resolve("../src/services/mailer")];
  const mailer = require("../src/services/mailer");

  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 201, text: async () => "" };
  };
  try {
    await mailer.send({ to: "maria@example.com", subject: "Code 123456", text: "t", html: "<p>t</p>" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(calls[0].init.headers["api-key"], "test-key");
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.sender, { name: "UDEI Loans", email: "udei.loans@gmail.com" });
    assert.deepEqual(body.to, [{ email: "maria@example.com" }]);
    assert.equal(mailer.outbox.length, 0, "nothing printed or kept when Brevo is configured");

    global.fetch = async () => ({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' });
    await assert.rejects(mailer.send({ to: "a@b.c", subject: "s", text: "t", html: "h" }), /Brevo answered 401/);
  } finally {
    global.fetch = realFetch;
    delete process.env.BREVO_API_KEY;
    delete process.env.MAIL_FROM;
    delete require.cache[require.resolve("../src/config/env")];
    delete require.cache[require.resolve("../src/services/mailer")];
  }
});

test("parseSender handles a bare address and a named one", () => {
  const { parseSender } = require("../src/services/mailer");
  assert.deepEqual(parseSender("x@gmail.com"), { email: "x@gmail.com" });
  assert.deepEqual(parseSender('"UDEI Loans" <x@gmail.com>'), { name: "UDEI Loans", email: "x@gmail.com" });
});
