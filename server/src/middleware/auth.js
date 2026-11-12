const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const { atLeast } = require("../config/access");

const COOKIE_NAME = "uedi_session";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

function signSession(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/** The web app sends a cookie; the mobile app sends "Authorization: Bearer <token>". */
function tokenOf(req) {
  const header = req.get?.("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.cookies?.[COOKIE_NAME];
}

async function loadUser(req, _res, next) {
  const token = tokenOf(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    const user = await User.findById(payload.sub);
    req.user = user && user.emailVerified !== false ? user : null;
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

// Office staff only. Members use /api/member and must not reach staff routes.
function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  if (req.user.role === "member") return res.status(403).json({ error: "You do not have access to this action." });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this action." });
    }
    next();
  };
}

/** Lets through `minRole` and every role above it on the ladder in config/access.js. */
function requireLevel(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in." });
    if (!atLeast(req.user.role, minRole)) {
      return res.status(403).json({ error: "You do not have access to this action." });
    }
    next();
  };
}

module.exports = { COOKIE_NAME, cookieOptions, signSession, loadUser, requireAuth, requireStaff, requireRole, requireLevel };
