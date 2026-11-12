require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

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
  mailFrom: process.env.MAIL_FROM || "",
  // Tests register many accounts from one address; they turn the per-IP limits off
  // and stop unsent mail from being printed.
  authRateLimit: process.env.AUTH_RATE_LIMIT !== "off",
  quietMail: process.env.QUIET_MAIL === "1",
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

if (isProduction && !(env.gmailUser && env.gmailAppPassword)) {
  throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set in production to send verification emails.");
}

module.exports = env;
