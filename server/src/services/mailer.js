const nodemailer = require("nodemailer");
const env = require("../config/env");

// Mail goes out one of two ways:
//   - Brevo's email API over HTTPS (BREVO_API_KEY). Use this on Render's free tier, which blocks
//     the SMTP ports Gmail needs.
//   - Gmail SMTP with an App Password (GMAIL_USER + GMAIL_APP_PASSWORD). Works locally and on paid hosts.
// Without either (development and tests) mail is not sent: it is printed to the console and kept
// in `outbox`, where the tests read the verification codes.
const outbox = [];
let transport;

function gmailTransport() {
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.gmailUser, pass: env.gmailAppPassword },
    // Fail in seconds rather than minutes when the host blocks SMTP, so sign-up doesn't hang.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Splits "UDEI Loans <x@gmail.com>" into Brevo's { name, email }. */
function parseSender(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || "");
  return m ? { name: m[1] || undefined, email: m[2].trim() } : { email: (from || "").trim() };
}

async function sendWithBrevo({ to, subject, text, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.brevoApiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseSender(env.mailFrom), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brevo answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function send({ to, subject, text, html }) {
  if (env.brevoApiKey) return sendWithBrevo({ to, subject, text, html });
  if (env.gmailUser && env.gmailAppPassword) {
    return gmailTransport().sendMail({ from: env.mailFrom || env.gmailUser, to, subject, text, html });
  }
  outbox.push({ to, subject, text });
  if (outbox.length > 50) outbox.shift();
  if (!env.quietMail) console.log(`[mail not configured] To: ${to} | ${subject}\n${text}\n`);
}

module.exports = { send, outbox, parseSender };
