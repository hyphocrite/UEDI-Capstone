const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const RevokedToken = require("../models/RevokedToken");
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

/** A session token with its own id (jti), so it can be ended on logout before it expires. */
function signSession(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    jwtid: crypto.randomUUID(),
  });
}

/** When a token from signSession() expires, as an ISO date. */
const expiryOf = (token) => new Date(jwt.decode(token).exp * 1000).toISOString();

/** Ends the request's session token: it stops working right away, on every device that has it. */
async function revokeSession(req) {
  const t = req.sessionToken;
  if (!t?.jti) return;
  await RevokedToken.updateOne({ jti: t.jti }, { $setOnInsert: { jti: t.jti, expiresAt: new Date(t.exp * 1000) } }, { upsert: true });
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
    if (payload.jti && (await RevokedToken.exists({ jti: payload.jti }))) {
      req.user = null;
      return next();
    }
    const user = await User.findById(payload.sub);
    // A password change ends the sessions started before it.
    const stale = user?.sessionsValidAfter && payload.iat * 1000 < user.sessionsValidAfter.getTime();
    req.user = user && user.emailVerified !== false && !stale ? user : null;
    if (req.user) req.sessionToken = { jti: payload.jti, exp: payload.exp };
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

module.exports = { COOKIE_NAME, cookieOptions, signSession, expiryOf, revokeSession, loadUser, requireAuth, requireStaff, requireRole, requireLevel };
