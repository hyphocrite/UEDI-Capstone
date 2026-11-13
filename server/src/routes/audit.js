const express = require("express");
const AuditLog = require("../models/AuditLog");
const { ACTIONS } = require("../middleware/audit");
const { requireRole } = require("../middleware/auth");

// The audit log, for administrators only. Read only: there is no route to change or delete entries.
const router = express.Router();
router.use(requireRole("admin"));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const day = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
// Manila is UTC+8 with no daylight saving, so a Manila calendar day starts at 16:00 UTC the day before.
const manilaStart = (d) => new Date(new Date(`${d}T00:00:00+08:00`).getTime());

router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ action: re }, { userName: re }, { userEmail: re }, { target: re }, { path: re }];
    }
    if (typeof req.query.action === "string" && req.query.action) filter.action = req.query.action.slice(0, 80);
    if (req.query.outcome === "ok") filter.ok = true;
    if (req.query.outcome === "failed") filter.ok = false;
    const from = day(req.query.from);
    const to = day(req.query.to);
    if (from || to) {
      filter.at = {};
      if (from) filter.at.$gte = manilaStart(from);
      if (to) filter.at.$lt = new Date(manilaStart(to).getTime() + 86_400_000);
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [entries, total] = await Promise.all([
      AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ entries, total, page, limit, actions: [...new Set(ACTIONS.map((a) => a[2]))] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
