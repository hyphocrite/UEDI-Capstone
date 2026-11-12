const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Application = require("../models/Application");
const { EMPLOYMENT_STATUSES, LOAN_TYPES, PAYMENT_FREQUENCIES } = require("../models/Application");
const ml = require("../services/mlClient");
const loans = require("../services/loans");
const { STEPS, STEP_LABELS, currentStepOf, nextStep, followsSuggestion } = require("../services/approvals");
const { requireStaff, requireLevel } = require("../middleware/auth");
const { seesAllLoans } = require("../config/access");

const router = express.Router();
router.use(requireStaff);

/** A member's own applications: filed for their member ID, or submitted from their account. */
const ownApplications = (user) => ({
  $or: [{ submittedBy: user._id }, ...(user.memberId ? [{ "applicant.memberId": user.memberId }] : [])],
});

/** What this user may see of an application: members don't get the internal ML scores. */
function forViewer(user, app) {
  if (seesAllLoans(user)) return app;
  const { assessment, assessmentError, ...rest } = app.toObject();
  return rest;
}

/** The application if this user may see it, else null. */
async function findVisible(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  const filter = { _id: req.params.id, ...(seesAllLoans(req.user) ? {} : ownApplications(req.user)) };
  return Application.findOne(filter);
}

const money = z.coerce.number().min(0).max(100_000_000);

const optionalDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.date().optional());

// "To be filled up by the Bookkeeper": set on the form, and checked or corrected when the Bookkeeper signs.
const bookkeeperSchema = z.object({
  longTermBalance: money.default(0),
  longTermDueDate: optionalDate,
  shortTermBalance: money.default(0),
  shortTermDueDate: optionalDate,
  // What the member already pays UEDI per month on these loans.
  monthlyPayment: money.default(0),
});

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
    bookkeeper: bookkeeperSchema.default({ longTermBalance: 0, shortTermBalance: 0 }),
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

const approvalSchema = z.object({
  decision: z.enum(["approved", "denied"], { message: "Choose approve or deny." }),
  note: z.string().trim().max(1000).optional(),
  bookkeeper: bookkeeperSchema.optional(),
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

/**
 * The Bookkeeper section: from the ledger when the member has loans on record, otherwise what was
 * typed (UEDI's older loans aren't in the system yet).
 */
async function bookkeeperFor(memberId, typed) {
  if (memberId) {
    const b = await loans.balancesFor(memberId);
    if (b.hasLoans) return loans.bookkeeperFromLedger(b);
  }
  return { ...typed, source: "manual", loans: [] };
}

/** Saves a new application from a parsed createSchema body and scores it. Also used by the member app. */
async function createApplication(data, user) {
  const bookkeeper = await bookkeeperFor(data.applicant.memberId, data.bookkeeper);
  let app;
  for (let attempt = 0; attempt < 3 && !app; attempt++) {
    try {
      app = await Application.create({
        ...data,
        applicant: { ...data.applicant, fullName: fullNameOf(data.applicant) },
        bookkeeper,
        applicationNo: await nextApplicationNo(),
        currentStep: STEPS[0],
        approvals: [],
        submittedBy: user._id,
        submittedByName: user.fullName,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err; // retry on a numbering clash
    }
  }
  return runAssessment(app);
}

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    // Members apply only for themselves, and the Bookkeeper section is the Bookkeeper's to fill.
    if (!seesAllLoans(req.user)) {
      if (!req.user.memberId) {
        return res.status(403).json({ error: "Your account isn't linked to a member record yet. Ask the UEDI office to link it." });
      }
      parsed.data.applicant.memberId = req.user.memberId;
      parsed.data.bookkeeper = { longTermBalance: 0, shortTermBalance: 0, monthlyPayment: 0 };
    }
    const app = await createApplication(parsed.data, req.user);
    res.status(201).json({ application: forViewer(req.user, app) });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const status = ["pending", "approved", "denied"].includes(req.query.status) ? req.query.status : undefined;
    let filter = status ? { status } : {};
    if (req.query.awaiting === "me") {
      // Pending applications at the caller's step that they have not already signed.
      const role = req.user.role;
      if (!STEPS.includes(role)) return res.json({ applications: [] });
      const atStep = role === STEPS[0] ? { $or: [{ currentStep: role }, { currentStep: { $exists: false } }, { currentStep: null }] } : { currentStep: role };
      filter = { status: "pending", ...atStep, "approvals.signedBy": { $ne: req.user._id } };
    }
    if (!seesAllLoans(req.user)) filter = { $and: [filter, ownApplications(req.user)] };
    const apps = await Application.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ applications: apps.map((a) => forViewer(req.user, a)) });
  } catch (err) {
    next(err);
  }
});

router.get("/model", requireLevel("loan_officer"), async (_req, res) => {
  try {
    res.json({ model: await ml.modelInfo() });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// The 8-classifier benchmark behind the Credit Model page.
router.get("/model/benchmark", requireLevel("admin"), async (_req, res) => {
  try {
    res.json(await ml.benchmark());
  } catch (err) {
    res.status(err.message.startsWith("No benchmark") ? 404 : 503).json({ error: err.message });
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const app = await findVisible(req);
    if (!app) return res.status(404).json({ error: "Application not found." });
    res.json({ application: forViewer(req.user, app) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assess", requireLevel("loan_officer"), async (req, res, next) => {
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

const sameBooks = (a = {}, b = {}) =>
  ["longTermBalance", "shortTermBalance", "monthlyPayment"].every((k) => (a[k] || 0) === (b[k] || 0)) &&
  ["longTermDueDate", "shortTermDueDate"].every((k) => String(a[k] ?? "") === String(b[k] ?? ""));

// Signs the current step of the approval chain: Bookkeeper, Treasurer, CreCom Chairman, President.
router.post("/:id/approvals", async (req, res, next) => {
  try {
    const parsed = approvalSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { decision, bookkeeper } = parsed.data;
    const note = parsed.data.note || undefined;

    const app = await Application.findById(req.params.id).catch(() => null);
    if (!app) return res.status(404).json({ error: "Application not found." });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });

    const step = currentStepOf(app);
    if (req.user.role !== step) {
      return res.status(403).json({ error: `It is the ${STEP_LABELS[step]}'s turn to sign this application.` });
    }
    // Separation of duties: one person signs at most one step, even if their role changed since.
    const signedBefore = app.approvals.find((a) => a.signedBy?.equals(req.user._id));
    if (signedBefore) {
      return res.status(403).json({
        error: `You already signed this application as ${STEP_LABELS[signedBefore.step]}. Another ${STEP_LABELS[step]} must sign this step.`,
      });
    }
    if (bookkeeper && step !== "bookkeeper") {
      return res.status(400).json({ error: "Only the Bookkeeper can change the balances." });
    }
    const fromLedger = step === "bookkeeper" && app.bookkeeper?.source === "ledger";
    if (bookkeeper && fromLedger) {
      return res.status(400).json({ error: "These balances come from the ledger and can't be edited. They are refreshed when you sign." });
    }
    if (decision === "denied" && !note) {
      return res.status(400).json({ error: "Add a note explaining why the application is denied." });
    }
    const followed = followsSuggestion(app.assessment?.ensemble?.suggestion, decision);
    if (followed === false && !note) {
      return res.status(400).json({ error: "Add a note explaining why you are going against the suggestion." });
    }

    const next = decision === "approved" ? nextStep(step) : null;
    const set = { currentStep: next ?? "none" };
    if (decision === "denied") set.status = "denied";
    else if (!next) set.status = "approved";
    // Ledger balances are refreshed at the Bookkeeper's step (a payment may have come in since filing);
    // typed balances take the Bookkeeper's corrections.
    const books = fromLedger
      ? loans.bookkeeperFromLedger(await loans.balancesFor(app.applicant.memberId))
      : bookkeeper && { ...bookkeeper, source: "manual", loans: [] };
    const booksChanged = books && !sameBooks(books, app.bookkeeper?.toObject?.() ?? app.bookkeeper);
    if (books) set.bookkeeper = books;

    const signature = {
      step,
      decision,
      note,
      signedBy: req.user._id,
      signedByName: req.user.fullName,
      signedAt: new Date(),
      followedSuggestion: followed ?? undefined,
    };
    // Only succeeds if nobody else signed in the meantime.
    const updated = await Application.findOneAndUpdate(
      {
        _id: app._id,
        status: "pending",
        "approvals.signedBy": { $ne: req.user._id },
        $expr: { $eq: [{ $size: { $ifNull: ["$approvals", []] } }, app.approvals.length] },
      },
      { $set: set, $push: { approvals: signature } },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return res.status(409).json({ error: "Someone else just signed this application. Reload to see the latest." });

    // Corrected balances change the debt the models see, so score again for the next signers.
    if (booksChanged && updated.status === "pending") await runAssessment(updated);
    if (updated.status === "approved") {
      const loan = await loans.createFromApplication(updated);
      updated.loanId = loan._id;
      updated.loanNo = loan.loanNo;
    }
    res.json({ application: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.createSchema = createSchema;
module.exports.createApplication = createApplication;
