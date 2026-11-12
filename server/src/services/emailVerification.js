const crypto = require("node:crypto");
const env = require("../config/env");
const User = require("../models/User");
const mailer = require("./mailer");

// New accounts confirm their email with a 6-digit code before they can sign in.
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

// Keyed with the JWT secret so a leaked database doesn't let anyone brute-force the codes offline.
const hashCode = (code) => crypto.createHmac("sha256", env.jwtSecret).update(code).digest("hex");

/** Gives the user a fresh code, saves it (hashed) and emails it. */
async function issue(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  user.emailVerification = {
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    sentAt: new Date(),
  };
  await user.save();
  await mailer.send({
    to: user.email,
    subject: `Your UEDI verification code: ${code}`,
    text:
      `Hello ${user.fullName},\n\n` +
      `Your UEDI account verification code is ${code}.\n` +
      `It expires in 15 minutes. If you didn't create a UEDI account, you can ignore this email.\n`,
    html:
      `<p>Hello ${escapeHtml(user.fullName)},</p>` +
      `<p>Your UEDI account verification code is</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      `<p>It expires in 15 minutes. If you didn't create a UEDI account, you can ignore this email.</p>`,
  });
}

const canResend = (user) =>
  !user.emailVerification?.sentAt || Date.now() - user.emailVerification.sentAt.getTime() >= RESEND_COOLDOWN_MS;

/**
 * Checks a code for the unverified account with this email. Returns { result: "ok", user },
 * { result: "invalid" } or { result: "expired" }. Each guess is counted atomically before the
 * comparison, so parallel requests can't get past MAX_ATTEMPTS.
 */
async function check(email, code) {
  const user = await User.findOneAndUpdate(
    {
      email,
      emailVerified: false,
      "emailVerification.expiresAt": { $gt: new Date() },
      "emailVerification.attempts": { $lt: MAX_ATTEMPTS },
    },
    { $inc: { "emailVerification.attempts": 1 } },
    { returnDocument: "after" },
  ).select("+emailVerification");
  if (!user) return { result: "expired" };

  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(user.emailVerification.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { result: user.emailVerification.attempts >= MAX_ATTEMPTS ? "expired" : "invalid" };
  }
  user.emailVerified = true;
  user.emailVerification = undefined;
  await user.save();
  return { result: "ok", user };
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

module.exports = { issue, check, canResend, MAX_ATTEMPTS };
