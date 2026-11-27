require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

/**
 * Express "trust proxy": how many proxies sit in front of the API (Render, and Vercel's /api
 * rewrite), so req.ip and the rate limits use the real client IP from X-Forwarded-For instead of
 * one shared proxy IP for everyone. TRUST_PROXY: a hop count, true/false, or an address list.
 * Default 1 in production, false in development and tests.
 */
function trustProxy(value) {
  if (value === undefined || value === "") return isProduction ? 1 : false;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const env = {
  isProduction,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/uedi",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  mlServiceUrl: (process.env.ML_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, ""),
  // Verification emails go out through a Gmail account with an App Password
  // (Google Account > Security > 2-Step Verification > App passwords).
  gmailUser: (process.env.GMAIL_USER || "").trim(),
  gmailAppPassword: (process.env.GMAIL_APP_PASSWORD || "").replace(/\s/g, ""),
  // Or Brevo's email API (brevo.com, free plan), which sends over HTTPS and so also works on
  // Render's free tier. MAIL_FROM must then be a sender verified in Brevo.
  brevoApiKey: (process.env.BREVO_API_KEY || "").trim(),
  mailFrom: (process.env.MAIL_FROM || "").trim(),
  // Tests register many accounts from one address; they turn the per-IP limits off
  // and stop unsent mail from being printed.
  authRateLimit: process.env.AUTH_RATE_LIMIT !== "off",
  quietMail: process.env.QUIET_MAIL === "1",
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  // Whether the very first account to sign up on the web becomes the administrator. Off in
  // production (use scripts/create-dev-admin or set ALLOW_FIRST_ADMIN=true once), on otherwise.
  allowFirstAdmin: process.env.ALLOW_FIRST_ADMIN ? process.env.ALLOW_FIRST_ADMIN === "true" : !isProduction,
  // The UDEI office email on the Privacy Notice, for questions and data requests.
  officeEmail: (process.env.OFFICE_EMAIL || process.env.MAIL_FROM || "").replace(/^.*<([^>]+)>.*$/, "$1").trim() || null,
};

if (!env.jwtSecret) {
  if (isProduction) {
    throw new Error("JWT_SECRET must be set in production.");
  }
  env.jwtSecret = "dev-only-secret-change-me";
  console.warn("JWT_SECRET is not set; using a development-only secret.");
} else if (isProduction && (env.jwtSecret.length < 32 || env.jwtSecret === "change-me")) {
  throw new Error("JWT_SECRET must be a random string of at least 32 characters in production.");
}

if (isProduction && !env.brevoApiKey && !(env.gmailUser && env.gmailAppPassword)) {
  throw new Error("Set BREVO_API_KEY, or GMAIL_USER and GMAIL_APP_PASSWORD, in production to send verification emails.");
}
if (env.brevoApiKey && !env.mailFrom) {
  throw new Error("MAIL_FROM must be set to a Brevo-verified sender when BREVO_API_KEY is used.");
}

module.exports = env;
