const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const { ROLES } = require("../models/User");
const {
  COOKIE_NAME,
  cookieOptions,
  signSession,
  requireAuth,
  requireRole,
} = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const verification = require("../services/emailVerification");

const router = express.Router();

const MINUTE = 60 * 1000;
const emailKey = (req) => String(req.body?.email || "").trim().toLowerCase();
const registerLimit = rateLimit({ windowMs: 60 * MINUTE, max: 10, message: "Too many sign-ups from this network. Try again later." });
const loginLimit = rateLimit({ windowMs: 15 * MINUTE, max: 10, key: emailKey, message: "Too many sign-in attempts. Wait 15 minutes and try again." });
const verifyLimit = rateLimit({ windowMs: 15 * MINUTE, max: 20, message: "Too many attempts. Wait 15 minutes and try again." });

// Compared against when the email is unknown, so a login takes as long whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128)
    .regex(/[A-Za-z]/, "Password must include a letter.")
    .regex(/[0-9]/, "Password must include a number."),
  branch: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(128),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

const resendSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

function firstIssue(result) {
  return result.error.issues[0]?.message || "Invalid input.";
}

function startSession(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), cookieOptions());
}

// Creates the account and emails a verification code. No session until the code is entered.
router.post("/register", registerLimit, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { fullName, email, password, branch } = parsed.data;

    if (await User.exists({ email })) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    // The very first account becomes the administrator.
    const role = (await User.estimatedDocumentCount()) === 0 ? "admin" : "staff";
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ fullName, email, passwordHash, role, branch, emailVerified: false });

    let emailSent = true;
    try {
      await verification.issue(user);
    } catch (err) {
      console.error("Could not send the verification email:", err.message);
      emailSent = false;
    }
    res.status(201).json({ verificationRequired: true, email: user.email, emailSent });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    next(err);
  }
});

router.post("/verify-email", verifyLimit, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { result, user } = await verification.check(parsed.data.email, parsed.data.code);
    if (result === "invalid") return res.status(400).json({ error: "That code is not correct. Check the email and try again." });
    if (result === "expired") {
      return res.status(400).json({ error: "This code has expired or was tried too many times. Request a new code." });
    }
    startSession(res, user);
    res.json({ session: user.toSession() });
  } catch (err) {
    next(err);
  }
});

// Always answers the same way, so it can't be used to find out which emails have accounts.
router.post("/resend-verification", verifyLimit, async (req, res, next) => {
  try {
    const parsed = resendSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const user = await User.findOne({ email: parsed.data.email, emailVerified: false }).select("+emailVerification");
    if (user && verification.canResend(user)) await verification.issue(user);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/login", loginLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { email, password } = parsed.data;

    const user = await User.findOne({ email }).select("+passwordHash");
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Invalid email or password." });
    // Checked after the password so it reveals nothing about accounts the caller can't sign in to.
    if (user.emailVerified === false) {
      return res.status(403).json({ error: "Verify your email before signing in.", code: "EMAIL_NOT_VERIFIED" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    startSession(res, user);
    res.json({ session: user.toSession() });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  res.json({ session: req.user ? req.user.toSession() : null });
});

router.get("/users", requireAuth, async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(200);
    res.json({ users: users.map((u) => ({ ...u.toSession(), createdAt: u.createdAt })) });
  } catch (err) {
    next(err);
  }
});

const roleSchema = z.object({ role: z.enum(ROLES, { message: "Choose a valid role." }) });

// Admins assign roles. An admin can't change their own role, and UEDI always keeps one admin.
router.patch("/users/:id/role", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = roleSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { role } = parsed.data;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "User not found." });
    if (req.user._id.equals(req.params.id)) {
      return res.status(400).json({ error: "You can't change your own role. Ask another administrator." });
    }

    const before = await User.findByIdAndUpdate(req.params.id, { $set: { role } });
    if (!before) return res.status(404).json({ error: "User not found." });
    // Checked after the change so two admins demoting each other at once can't both succeed.
    if (before.role === "admin" && role !== "admin" && (await User.countDocuments({ role: "admin" })) === 0) {
      await User.updateOne({ _id: before._id }, { $set: { role: "admin" } });
      return res.status(409).json({ error: "UEDI needs at least one administrator. Make someone else an administrator first." });
    }
    const user = await User.findById(before._id);
    res.json({ user: { ...user.toSession(), createdAt: user.createdAt } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
