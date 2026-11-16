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
const { auditNote } = require("../middleware/audit");
const memberIds = require("../services/memberIds");
const { explain } = require("../services/explain");
const documentFiles = require("../services/documentFiles");
const coMakers = require("../services/coMakers");
const settings = require("../services/settings");

const router = express.Router();
router.use(requireStaff);

/** A member's own applications: filed for their member ID, or submitted from their account. */
const ownApplications = (user) => ({
  $or: [{ submittedBy: user._id }, ...(user.memberId ? [{ "applicant.memberId": user.memberId }] : [])],
});

/**
 * What this user may see of an application. Staff get the scores and the plain-language
 * explanation. Members never get the scores; once denied, they get the explanation (reasons and
 * what they can do), without numbers.
 */
function forViewer(user, app) {
  // toJSON, like a plain res.json: it fills in currentStep for applications from before the chain.
  const out = app.toJSON();
  const explanation = explain(out.assessment);
  if (seesAllLoans(user)) return { ...out, explanation };
  delete out.assessment;
  delete out.assessmentError;
  if (out.status === "denied" && explanation) out.explanation = { against: explanation.against, tips: explanation.tips };
  return out;
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

// A supporting document as the applicant's browser checked it (the file itself is uploaded after).
const MAX_DOCUMENTS = 30;
const documentCheckSchema = z.object({
  fileName: z.string().max(255),
  type: z.string().max(64).optional(),
  verdict: z.enum(["verified", "review", "mismatch", "unreadable"]).optional(),
  sha256: z.string().max(64).optional(),
  notes: z.array(z.string().max(300)).max(20).optional(),
});

// The supporting documents every application must have, by loan type. Kept in step with
// REQUIRED_DOCUMENTS in client/src/lib/ocr/documentTypes.ts and mobile/src/documents.tsx.
const REQUIRED_DOCUMENTS = {
  long_term: ["valid_id", "payslip", "proof_of_address", "application_form"],
  emergency: ["valid_id", "payslip", "application_form"],
};
const DOCUMENT_LABELS = {
  valid_id: "Valid government ID",
  payslip: "Latest payslip",
  proof_of_address: "Proof of address",
  application_form: "Signed application form",
};

/** A message naming the required documents missing from these types, or null when all are there. */
function missingDocuments(loanType, types) {
  const have = new Set(types);
  const missing = (REQUIRED_DOCUMENTS[loanType] || []).filter((t) => !have.has(t));
  return missing.length ? `Supporting documents are required. Still missing: ${missing.map((t) => DOCUMENT_LABELS[t]).join(", ")}.` : null;
}

const peso = (n) => `₱${Number(n).toLocaleString("en-PH")}`;

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
      netTakeHomePay: money
        .refine((n) => n > 0, "Enter the net take-home pay.")
        .refine((n) => n === 0 || n >= settings.MIN_NET_TAKE_HOME_PAY, `The net take-home pay must be at least ${peso(settings.MIN_NET_TAKE_HOME_PAY)}.`),
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
      // Required: the signers read it next to the ML suggestion.
      purpose: z.string({ message: "Give the reason for the loan." }).trim().min(3, "Give the reason for the loan.").max(300),
    }),
    bookkeeper: bookkeeperSchema.default({ longTermBalance: 0, shortTermBalance: 0 }),
    agreement: z.object({
      payrollDeduction: z.literal(true, { message: "The applicant must authorize payroll deduction." }),
      autoRestructure: z.literal(true, { message: "The applicant must agree to automatic restructuring." }),
      applicationDate: z.coerce.date(),
    }),
    // Member numbers of 1 or 2 co-makers (how many is a Loan Setting). Checked in createApplication.
    coMakers: z.array(z.string().trim().max(32)).max(2).default([]),
    documents: z.array(documentCheckSchema).max(MAX_DOCUMENTS).default([]),
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

/**
 * The co-makers as stored entries, after the co-maker rules. An applicant who isn't a linked UDEI
 * member (no member number, or only the provisional one from sign-up) borrows at most
 * rules.nonMemberMaxAmount and needs a full member as co-maker. Throws CoMakerError, which the
 * routes answer with 400.
 */
async function resolveCoMakers(rules, data) {
  const memberId = data.applicant.memberId;
  const needed = settings.coMakersNeeded(rules, data.loan.amount);
  const limit = rules.nonMemberMaxAmount;
  if (!limit || (await memberIds.isLinked(memberId))) {
    return coMakers.resolve(data.coMakers, memberId, needed, rules.coMakersFromAmount);
  }
  if (data.loan.amount > limit) {
    throw new coMakers.CoMakerError(`Applicants who aren't linked to a UDEI member number can borrow at most ${peso(limit)}.`);
  }
  if (!data.coMakers.some((c) => String(c).trim())) {
    throw new coMakers.CoMakerError("Applicants who aren't linked to a UDEI member number need a co-maker: a UDEI member who vouches for this loan.");
  }
  return coMakers.resolve(data.coMakers, memberId, Math.max(needed, 1), rules.coMakersFromAmount, { membersOnly: true });
}

/** Saves a new application from a parsed createSchema body and scores it. Also used by the member app. */
async function createApplication(data, user) {
  const rules = await settings.get();
  data.coMakers = await resolveCoMakers(rules, data);
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
  if (app.coMakers.length) coMakers.notifyNamed(app).catch(() => {});
  return runAssessment(app);
}

/** Applies Loan Settings to a parsed form: sets the rate, and returns a problem with the rules or null. */
function applyRules(rules, data) {
  // The rate is always the one in Loan Settings, whatever the form sent.
  const product = rules.products[data.loan.loanType];
  if (product) data.loan.monthlyRate = product.monthlyRate;
  return settings.checkApplication(rules, {
    monthlySalary: data.applicant.monthlySalary,
    loanType: data.loan.loanType,
    termMonths: data.loan.termMonths,
  });
}

/** Only the person who filed an application may change it or add to it. */
const filedBy = (app, user) => !!app.submittedBy?.equals(user._id);

const EDIT_CLOSED = "The Bookkeeper already signed this application, so it can't be changed any more. You can still add supporting documents.";

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const ruleError = applyRules(await settings.get(), parsed.data);
    if (ruleError) return res.status(400).json({ error: ruleError });
    const missing = missingDocuments(parsed.data.loan.loanType, parsed.data.documents.map((d) => d.type));
    if (missing) return res.status(400).json({ error: missing });
    // Members apply only for themselves, and the Bookkeeper section is the Bookkeeper's to fill.
    if (!seesAllLoans(req.user)) {
      // Accounts made before new member IDs existed get one now.
      parsed.data.applicant.memberId = await memberIds.ensureFor(req.user);
      parsed.data.bookkeeper = { longTermBalance: 0, shortTermBalance: 0, monthlyPayment: 0 };
    }
    const app = await createApplication(parsed.data, req.user);
    auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName} · ₱${app.loan.amount.toLocaleString("en-PH")}` });
    res.status(201).json({ application: forViewer(req.user, app) });
  } catch (err) {
    if (err instanceof coMakers.CoMakerError) return res.status(400).json({ error: err.message });
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

// The applicant changes their application: the same form as filing, allowed until the Bookkeeper
// signs. The models score it again. Documents aren't touched here (see POST /:id/documents).
router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Application not found." });
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found." });
    auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName}` });
    if (!filedBy(app, req.user)) return res.status(403).json({ error: "Only the person who filed the application can change it." });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });
    if (app.approvals.length) return res.status(409).json({ error: EDIT_CLOSED, code: "EDIT_CLOSED" });

    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const data = parsed.data;
    const rules = await settings.get();
    const ruleError = applyRules(rules, data);
    if (ruleError) return res.status(400).json({ error: ruleError });
    // The application stays under the same member; a member's Bookkeeper section stays the Bookkeeper's.
    data.applicant.memberId = app.applicant.memberId;
    if (!seesAllLoans(req.user)) data.bookkeeper = { longTermBalance: 0, shortTermBalance: 0, monthlyPayment: 0 };

    // Co-makers vouch for a loan of a given amount and term: they keep their answer only if they are
    // still named and the loan they agreed to is unchanged. Everyone else is asked (again).
    const named = await resolveCoMakers(rules, data);
    const sameLoan = ["loanType", "amount", "termMonths", "paymentFrequency"].every((k) => app.loan[k] === data.loan[k]);
    const kept = (c) => sameLoan && app.coMakers.find((x) => x.memberId === c.memberId && x.status !== "pending");
    const nextCoMakers = named.map((c) => {
      const before = kept(c);
      return before ? before.toObject() : c;
    });
    const askAgain = nextCoMakers.filter((c) => c.status === "pending" && !(sameLoan && app.coMakers.some((x) => x.memberId === c.memberId)));

    const before = { amount: app.loan.amount, termMonths: app.loan.termMonths, loanType: app.loan.loanType, coMakers: app.coMakers.map((c) => c.memberId) };
    // Only succeeds if nobody signed in the meantime.
    const updated = await Application.findOneAndUpdate(
      { _id: app._id, status: "pending", "approvals.0": { $exists: false } },
      {
        $set: {
          applicant: { ...data.applicant, fullName: fullNameOf(data.applicant) },
          loan: data.loan,
          bookkeeper: await bookkeeperFor(data.applicant.memberId, data.bookkeeper),
          agreement: data.agreement,
          coMakers: nextCoMakers,
          editedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return res.status(409).json({ error: EDIT_CLOSED, code: "EDIT_CLOSED" });
    if (askAgain.length) coMakers.notifyNamed({ ...updated.toObject(), coMakers: askAgain }).catch(() => {});
    await runAssessment(updated);
    auditNote(res, {
      target: `${updated.applicationNo} · ${updated.applicant.fullName} · ₱${updated.loan.amount.toLocaleString("en-PH")}`,
      before,
      details: { amount: updated.loan.amount, termMonths: updated.loan.termMonths, loanType: updated.loan.loanType, coMakers: updated.coMakers.map((c) => c.memberId), coMakersAskedAgain: askAgain.map((c) => c.memberId) },
    });
    res.json({ application: forViewer(req.user, updated) });
  } catch (err) {
    if (err instanceof coMakers.CoMakerError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// The applicant adds supporting documents (their checks; the files follow through PUT
// /:id/documents/:index). Allowed until the application is decided, after signatures too.
// Answers with the new documents' positions for the uploads.
router.post("/:id/documents", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Application not found." });
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: "Application not found." });
    auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName}` });
    if (!filedBy(app, req.user)) return res.status(403).json({ error: "Only the person who filed the application can add documents to it." });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}, so documents can't be added.` });

    const parsed = z.object({ documents: z.array(documentCheckSchema).min(1, "Add at least one document.").max(MAX_DOCUMENTS) }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const added = parsed.data.documents.map((d) => ({ ...d, addedAt: new Date() }));
    const room = MAX_DOCUMENTS - added.length;
    if (app.documents.length > room) return res.status(400).json({ error: `An application can have at most ${MAX_DOCUMENTS} documents.` });

    const updated = await Application.findOneAndUpdate(
      { _id: app._id, status: "pending", $expr: { $lte: [{ $size: { $ifNull: ["$documents", []] } }, room] } },
      { $push: { documents: { $each: added } } },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return res.status(409).json({ error: "The application changed in the meantime. Reload and try again." });
    const first = updated.documents.length - added.length;
    auditNote(res, { details: { added: added.map((d) => `${d.fileName}${d.verdict ? ` (${d.verdict})` : ""}`), afterSignatures: updated.approvals.length } });
    res.status(201).json({ application: forViewer(req.user, updated), indexes: added.map((_, i) => first + i) });
  } catch (err) {
    next(err);
  }
});

// The applicant's browser uploads each supporting document after filing. Only the person who
// filed it, only into an empty slot, and only the exact file that was checked (same SHA-256).
router.put(
  "/:id/documents/:index",
  express.raw({ type: [...documentFiles.TYPES], limit: documentFiles.MAX_BYTES }),
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Application not found." });
      const app = await Application.findById(req.params.id);
      if (!app) return res.status(404).json({ error: "Application not found." });
      auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName}` });
      if (!filedBy(app, req.user)) return res.status(403).json({ error: "Only the person who filed the application can upload its documents." });
      const index = Number(req.params.index);
      const doc = app.documents[index];
      if (!doc) return res.status(404).json({ error: "That document is not on the application." });
      if (doc.fileId) return res.status(409).json({ error: "This document was already uploaded." });
      const type = req.get("content-type")?.split(";")[0];
      if (!Buffer.isBuffer(req.body) || !documentFiles.TYPES.has(type)) {
        return res.status(415).json({ error: "Upload a JPEG, PNG, WebP or PDF file." });
      }
      if (!doc.sha256 || documentFiles.sha256(req.body) !== doc.sha256) {
        return res.status(400).json({ error: "This is not the file that was checked when the application was filed." });
      }
      const fileId = await documentFiles.save(req.body, { fileName: doc.fileName, contentType: type, applicationId: app._id, index });
      // Set only if still empty, in case two uploads of the same slot raced.
      const saved = await Application.updateOne(
        { _id: app._id, [`documents.${index}.fileId`]: { $exists: false } },
        { $set: { [`documents.${index}.fileId`]: fileId, [`documents.${index}.contentType`]: type, [`documents.${index}.size`]: req.body.length } },
      );
      if (!saved.modifiedCount) return res.status(409).json({ error: "This document was already uploaded." });
      res.json({ ok: true });
    } catch (err) {
      if (err?.type === "entity.too.large") return res.status(413).json({ error: "Files can be at most 10 MB." });
      next(err);
    }
  },
);

// The stored file, shown in the document viewer. Staff, and the applicant for their own application.
router.get("/:id/documents/:index/file", async (req, res, next) => {
  try {
    const app = await findVisible(req);
    const doc = app?.documents[Number(req.params.index)];
    if (!doc?.fileId) return res.status(404).json({ error: "This document's file was not uploaded." });
    res.setHeader("Content-Type", doc.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    // The viewer fetches it into the page; opened directly, a file still can't run scripts.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    const stream = documentFiles.open(doc.fileId);
    stream.on("error", (err) => (res.headersSent ? res.destroy(err) : next(err)));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/assess", requireLevel("loan_officer"), async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id).catch(() => null);
    if (!app) return res.status(404).json({ error: "Application not found." });
    auditNote(res, { target: `${app.applicationNo} · ${app.applicant.fullName}` });
    await runAssessment(app);
    if (app.assessmentError) return res.status(503).json({ error: app.assessmentError, application: forViewer(req.user, app) });
    res.json({ application: forViewer(req.user, app) });
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
    const step = currentStepOf(app);
    auditNote(res, {
      action: decision === "approved" ? "Application approved" : "Application denied",
      target: `${app.applicationNo} · ${app.applicant.fullName} · ${STEP_LABELS[step] || step}'s step`,
      before: { status: app.status, currentStep: step },
    });
    if (app.status !== "pending") return res.status(409).json({ error: `This application was already ${app.status}.` });
    // Co-makers confirm first; a denial needs no co-maker answer.
    const waiting = coMakers.blocking(app);
    if (waiting && decision === "approved") return res.status(409).json({ error: waiting, code: "CO_MAKERS_PENDING" });

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
    auditNote(res, {
      action: decision === "denied" ? "Application denied" : updated.status === "approved" ? "Application approved (final, loan created)" : "Application approved",
      details: { decision, note, step: STEP_LABELS[step], result: updated.status, nextStep: updated.status === "pending" ? STEP_LABELS[updated.currentStep] : undefined, loanNo: updated.loanNo, balancesCorrected: !!booksChanged },
    });
    res.json({ application: forViewer(req.user, updated) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.createSchema = createSchema;
module.exports.createApplication = createApplication;
module.exports.missingDocuments = missingDocuments;
module.exports.REQUIRED_DOCUMENTS = REQUIRED_DOCUMENTS;
