const nodemailer = require("nodemailer");
const env = require("../config/env");

// Without Gmail credentials (development and tests) mail is not sent: it is printed to the
// console and kept in `outbox`, where the tests read the verification codes.
const outbox = [];
let transport;

function gmailTransport() {
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.gmailUser, pass: env.gmailAppPassword },
  });
  return transport;
}

async function send({ to, subject, text, html }) {
  if (!(env.gmailUser && env.gmailAppPassword)) {
    outbox.push({ to, subject, text });
    if (outbox.length > 50) outbox.shift();
    if (!env.quietMail) console.log(`[mail not configured] To: ${to} | ${subject}\n${text}\n`);
    return;
  }
  await gmailTransport().sendMail({ from: env.mailFrom || env.gmailUser, to, subject, text, html });
}

module.exports = { send, outbox };
