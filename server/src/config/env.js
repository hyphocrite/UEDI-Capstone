require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const env = {
  isProduction,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/uedi",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
};

if (!env.jwtSecret) {
  if (isProduction) {
    throw new Error("JWT_SECRET must be set in production.");
  }
  env.jwtSecret = "dev-only-secret-change-me";
  console.warn("JWT_SECRET is not set; using a development-only secret.");
}

module.exports = env;
