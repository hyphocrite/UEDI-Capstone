const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const User = require("../models/User");
const {
  COOKIE_NAME,
  cookieOptions,
  signSession,
  requireAuth,
} = require("../middleware/auth");

const router = express.Router();

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
  password: z.string().min(1, "Enter your password."),
});

function firstIssue(result) {
  return result.error.issues[0]?.message || "Invalid input.";
}

function startSession(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), cookieOptions());
}

router.post("/register", async (req, res, next) => {
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
    const user = await User.create({ fullName, email, passwordHash, role, branch });

    startSession(res, user);
    res.status(201).json({ session: user.toSession() });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const { email, password } = parsed.data;

    const user = await User.findOne({ email }).select("+passwordHash");
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid email or password." });

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

module.exports = router;
