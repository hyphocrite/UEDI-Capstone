const express = require("express");
const earlyWarning = require("../services/earlyWarning");
const ml = require("../services/mlClient");
const { requireStaff, requireLevel } = require("../middleware/auth");

// Active loans likely to miss a payment soon, for Loan Officers and up.
const router = express.Router();
router.use(requireStaff, requireLevel("loan_officer"));

router.get("/", async (_req, res) => {
  try {
    res.json(await earlyWarning.current());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

router.get("/model", async (_req, res) => {
  try {
    res.json({ model: await ml.earlyWarningModel() });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
