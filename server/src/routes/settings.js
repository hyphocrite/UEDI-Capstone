const express = require("express");
const { z } = require("zod");
const settings = require("../services/settings");
const { auditNote } = require("../middleware/audit");
const { requireLevel } = require("../middleware/auth");

const router = express.Router();

// Rates, terms, the minimum salary and branch names aren't secret: the sign-up page and the
// member app read them before anyone signs in.
router.get("/", async (_req, res, next) => {
  try {
    res.json({ settings: await settings.get() });
  } catch (err) {
    next(err);
  }
});

const product = (label) =>
  z.object({
    label: z.string().trim().min(1).max(60).default(label),
    monthlyRate: z.coerce.number({ message: "Enter the interest rate." }).min(0).max(10, "Rates are at most 10% per month."),
    maxTermMonths: z.coerce.number().int("Enter whole months.").min(1, "The longest term must be at least 1 month.").max(120, "The longest term is 120 months."),
  });

const saveSchema = z.object({
  products: z.object({ long_term: product("Long term"), emergency: product("Emergency") }),
  minMonthlySalary: z.coerce.number({ message: "Enter the minimum monthly salary." }).min(0).max(10_000_000),
  branches: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Keep at least one branch or office.")
    .max(50)
    .transform((list) => [...new Set(list)]),
});

// Same people who can open the Settings page: CreCom Chairman, President and Administrator.
router.put("/", requireLevel("crecom_chair"), async (req, res, next) => {
  try {
    const parsed = saveSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const before = await settings.get();
    auditNote(res, { target: "Loan Settings", before });
    // Interest rates are fixed by the Administrator; CreCom and the President set the other rules.
    const rateChanged = Object.keys(before.products).some((t) => parsed.data.products?.[t] && parsed.data.products[t].monthlyRate !== before.products[t].monthlyRate);
    if (rateChanged && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only the Administrator can change interest rates." });
    }
    res.json({ settings: await settings.save(parsed.data, req.user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
