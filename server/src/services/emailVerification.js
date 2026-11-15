const crypto = require("node:crypto");
const env = require("../config/env");
const User = require("../models/User");
const mailer = require("./mailer");

// Emailed 6-digit codes, for two purposes that work the same way:
//   - "verify": new accounts confirm their email before they can sign in.
//   - "reset": someone who forgot their password proves they own the email, then sets a new one.
// Each purpose keeps its code in its own field, so asking for a reset doesn't cancel a sign-up code.
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const PURPOSES = {
  verify: {
    field: "emailVerification",
    // Only accounts still waiting for verification.
    filter: { emailVerified: false },
    subject: (code) => `Your UDEI verification code: ${code}`,
    lead: "Your UDEI account verification code is",
    ignore: "If you didn't create a UDEI account, you can ignore this email.",
  },
  reset: {
    field: "passwordReset",
    filter: {},
    subject: (code) => `Your UDEI password reset code: ${code}`,
    lead: "Your UDEI password reset code is",
    ignore: "If you didn't ask to reset your password, you can ignore this email; your password stays the same.",
  },
};

// Keyed with the JWT secret so a leaked database doesn't let anyone brute-force the codes offline.
const hashCode = (code) => crypto.createHmac("sha256", env.jwtSecret).update(code).digest("hex");

/** Gives the user a fresh code for this purpose, saves it (hashed) and emails it. */
async function issue(user, purpose = "verify") {
  const p = PURPOSES[purpose];
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  user[p.field] = {
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    sentAt: new Date(),
  };
  await user.save();
  await mailer.send({
    to: user.email,
    subject: p.subject(code),
    text: `Hello ${user.fullName},\n\n${p.lead} ${code}.\nIt expires in 15 minutes. ${p.ignore}\n`,
    html:
      `<p>Hello ${escapeHtml(user.fullName)},</p>` +
      `<p>${p.lead}</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      `<p>It expires in 15 minutes. ${p.ignore}</p>`,
  });
}

const canResend = (user, purpose = "verify") => {
  const sentAt = user[PURPOSES[purpose].field]?.sentAt;
  return !sentAt || Date.now() - sentAt.getTime() >= RESEND_COOLDOWN_MS;
};

/**
 * Checks a code for the account with this email. Returns { result: "ok", user },
 * { result: "invalid" } or { result: "expired" }. Each guess is counted atomically before the
 * comparison, so parallel requests can't get past MAX_ATTEMPTS. On success the code is used up,
 * and the email counts as verified (a reset code proves it too).
 */
async function check(email, code, purpose = "verify") {
  const p = PURPOSES[purpose];
  const user = await User.findOneAndUpdate(
    {
      email,
      ...p.filter,
      [`${p.field}.expiresAt`]: { $gt: new Date() },
      [`${p.field}.attempts`]: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { [`${p.field}.attempts`]: 1 } },
    { returnDocument: "after" },
  ).select(`+${p.field}`);
  if (!user) return { result: "expired" };

  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(user[p.field].codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { result: user[p.field].attempts >= MAX_ATTEMPTS ? "expired" : "invalid" };
  }
  user.emailVerified = true;
  user[p.field] = undefined;
  await user.save();
  return { result: "ok", user };
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

module.exports = { issue, check, canResend, MAX_ATTEMPTS };
