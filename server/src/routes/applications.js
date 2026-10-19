const express = require("express");
const { z } = require("zod");
const Application = require("../models/Application");
const { EMPLOYMENT_STATUSES, LOAN_TYPES, PAYMENT_FREQUENCIES } = require("../models/Application");
const ml = require("../services/mlClient");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const money = z.coerce.number().min(0).max(100_000_000);

const optionalDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.date().optional());

// The body mirrors UEDI's Mutual Assistance Application Form.
const createSchema = z
  .object({
    applicant: z.object({
      lastName: z.string().trim().min(1, "Enter the last name.").max(60),
      firstName: z.string().trim().min(1, "Enter the first name.").max(60),
      middleInitial: z.string().trim().max(3).optional(),
      memberId: z.string().trim().max(32).optional(),
      residenceAddress: z.string().trim().min(5, "Enter the residence address.").max(300),
      employer: z.string().trim().min(2, "Enter the employer.").max(120),
      employmentStatus: z.enum(EMPLOYMENT_STATUSES).default("permanent"),
      monthlySalary: money.refine((n) => n > 0, "Enter the monthly salary."),
      netTakeHomePay: money.refine((n) => n > 0, "Enter the net take-home pay."),
      dateOfBirth: optionalDate,
      yearsAsMember: z.coerce.number().min(0).max(80).default(0),
      priorLoans: z.coerce.number().int().min(0).max(500).default(0),
      priorLatePayments: z.coerce.number().int().min(0).max(500).default(0),
    }),
    loan: z.object({
      loanType: z.enum(LOAN_TYPES, { message: "Choose Long term or Emergency." }),
      amount: money.refine((n) => n > 0, "Enter the loan amount."),
      termMonths: z.coerce.number().int().min(1).max(120),
      monthlyRate: z.coerce.number().min(0).max(10),
      paymentFrequency: z.enum(PAYMENT_FREQUENCIES).default("monthly"),
      purpose: z.string().trim().max(300).optional(),
    }),
    bookkeeper: z
      .object({
        longTermBalance: money.default(0),
        longTermDueDate: optionalDate,
        shortTermBalance: money.default(0),
        shortTermDueDate: optionalDate,
      })
      .default({ longTermBalance: 0, shortTermBalance: 0 }),
    agreement: z.object({
      payrollDeduction: z.literal(true, { message: "The applicant must authorize payroll deduction." }),
      autoRestructure: z.literal(true, { message: "The applicant must agree to automatic restructuring." }),
      applicationDate: z.coerce.date(),
    }),
    documents: z
      .array(
        z.object({
          fileName: z.string().max(255),
          type: z.string().max(64).optional(),
          verdict: z.enum(["verified", "review", "mismatch", "unreadable"]).optional(),
          sha256: z.string().max(64).optional(),
          notes: z.array(z.string().max(300)).max(20).optional(),
        }),
      )
      .max(30)
      .default([]),
  })
  .refine((v) => v.applicant.priorLatePayments <= v.applicant.priorLoans, {
    message: "Late payments cannot be more than past loans.",
  })
  .refine((v) => v.applicant.netTakeHomePay <= v.applicant.monthlySalary, {
    message: "Net take-home pay cannot be more than the monthly salary.",
  });

function fullNameOf(a) {
  const mi = a.middleInitial ? ` ${a.middleInitial.replace(/\.$/, "")}.` : "";
  return `${a.firstName}${mi} ${a.lastName}`;
}

const decisionSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  note: z.string().trim().max(1000).optional(),
});

async function nextApplicationNo() {
  const year = new Date().getFullYear();
  const count = await Application.countDocuments({ applicationNo: new RegExp(`^APP-${year}-`) });
  return `APP-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Scores the application with the ML service and stores the result on it. */
async function runAssessment(app) {
  try {
    app.assessment = { ...(await ml.assess(app)), assessedAt: new Date() };
    app.assessmentError = undefined;
  } catch (err) {
    app.assessmentError = err.message;
  }
  await app.save();
  return app;
}

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    let app;
    for (let attempt = 0; attempt < 3 && !app; attempt++) {
      try {
        app = await Application.create({
          ...parsed.data,
          applicant: { ...parsed.data.applicant, fullName: fullNameOf(parsed.data.applicant) },
          applicationNo: await nextApplicationNo(),
          submittedBy: req.user._id,
          submittedByName: req.user.fullName,
        });
      } catch (err) {
        if (err?.code !== 11000) throw err; // retry on a numbering clash
      }
    }
    await runAssessment(app);
    res.status(201).json({ application: app });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const status = ["pending", "approved", "denied"].includes(req.query.status) ? req.query.status : undefined;
    const apps = await Application.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200);
    res.json({ applications: apps });
  } catch (err) {
    next(err);
  }
});

router.get("/model", async (_req, res) => {
  try {
    res.json({ model: await ml.modelInfo() });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id).catch(() => null);
    if (!app) return res.status(404).json({ error: "Application not found." });
    res.json({ application: app });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assess", async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id).catch(() => null);
    if (!app) return res.status(404).json({ error: "Application not found." });
    await runAssessment(app);
    if (app.assessmentError) return res.status(503).json({ error: app.assessmentError, application: app });
    res.json({ application: app });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/decision", requireRole("admin", "loan_officer"), async (req, res, next) => {
  try {
    const parsed = decisionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Choose approve or deny." });
    const { decision, note } = parsed.data;

    const app = await Application.findById(req.params.id).catch(() => null);
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });

    const suggestion = app.assessment?.ensemble?.suggestion;
    const followed =
      suggestion === "review" || !suggestion ? null : (suggestion === "approve") === (decision === "approved");
    if (followed === false && !note) {
      return res.status(400).json({ error: "Add a note explaining why you are going against the suggestion." });
    }

    app.status = decision;
    app.decision = {
      decision,
      note,
      followedSuggestion: followed ?? undefined,
      decidedBy: req.user._id,
      decidedByName: req.user.fullName,
      decidedAt: new Date(),
    };
    await app.save();
    res.json({ application: app });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
