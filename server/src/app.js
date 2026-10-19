const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const env = require("./config/env");
const { loadUser } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const applicationRoutes = require("./routes/applications");
const loanRoutes = require("./routes/loans");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(loadUser);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/loans", loanRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

module.exports = { createApp };
