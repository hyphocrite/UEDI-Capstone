const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const env = require("./config/env");
const { loadUser } = require("./middleware/auth");
const { audit } = require("./middleware/audit");
const authRoutes = require("./routes/auth");
const applicationRoutes = require("./routes/applications");
const loanRoutes = require("./routes/loans");
const deductionRoutes = require("./routes/deductions");
const memberRoutes = require("./routes/member");
const membersRoutes = require("./routes/members");
const planRoutes = require("./routes/retirementPlans");
const reportRoutes = require("./routes/reports");
const settingsRoutes = require("./routes/settings");
const auditRoutes = require("./routes/audit");
const locationRoutes = require("./routes/locations");
const meetingRoutes = require("./routes/meetings");
const earlyWarningRoutes = require("./routes/earlyWarning");
const coMakerRoutes = require("./routes/coMaker");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // API responses hold member and loan data: never sniffed, framed or cached.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(loadUser);
  app.use(audit);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/loans", loanRoutes);
  app.use("/api/deductions", deductionRoutes);
  app.use("/api/member", memberRoutes);
  app.use("/api/members", membersRoutes);
  app.use("/api/retirement-plans", planRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/locations", locationRoutes);
  app.use("/api/meetings", meetingRoutes);
  app.use("/api/early-warning", earlyWarningRoutes);
  app.use("/api/comaker", coMakerRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}

module.exports = { createApp };
