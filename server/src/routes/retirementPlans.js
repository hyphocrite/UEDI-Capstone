const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const RetirementPlan = require("../models/RetirementPlan");
const Member = require("../models/Member");
const plans = require("../services/retirementPlans");
const ledger = require("../services/ledger");
const { auditNote } = require("../middleware/audit");
const { requireStaff, requireLevel, requireRole } = require("../middleware/auth");

// Retirement plans. Amounts are integer centavos, like /api/loans.
// Loan Officers and above can look; the Bookkeeper and Treasurer enroll members and record contributions.
const router = express.Router();
router.use(requireStaff, requireLevel("loan_officer"));
const canWrite = requireRole("bookkeeper", "treasurer");

const calendarDate = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${what}.`);
const centavos = (what) => z.coerce.number().int(`Enter the ${what} in centavos.`).min(0).max(100_000_000_00);

const createSchema = z
  .object({
    memberId: z.string().trim().min(1, "Choose the member.").max(32),
    startDate: calendarDate("start date"),
    monthlyContribution: centavos("monthly contribution").refine((n) => n > 0, "Enter the monthly contribution."),
    planShare: centavos("plan share"),
    openingBalance: centavos("opening balance").default(0),
  })
  .refine((v) => v.planShare <= v.monthlyContribution, { message: "The plan share can't be more than the monthly contribution." });

const contributionSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month this payment covers."),
  amount: centavos("plan contribution"),
  dues: centavos("monthly dues").optional(),
  paidAt: calendarDate("payment date"),
  method: z.enum(["payroll", "cash", "other"], { message: "Choose payroll, cash or other." }),
  reference: z.string().trim().max(60).optional(),
});

const voidSchema = z.object({ reason: z.string().trim().min(3, "Give a reason for voiding this contribution.").max(300) });

const find = (id) => (mongoose.isValidObjectId(id) ? RetirementPlan.findById(id) : null);

router.get("/", async (req, res, next) => {
  try {
    const filter = typeof req.query.memberId === "string" && req.query.memberId ? { memberId: req.query.memberId.slice(0, 32) } : {};
    const found = await RetirementPlan.find(filter).limit(5000);
    const list = found.map((p) => plans.present(p));
    list.sort((a, b) => a.memberId.localeCompare(b.memberId, "en", { numeric: true }));
    res.json({ plans: list });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const plan = await find(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found." });
    auditNote(res, { target: `No. ${plan.memberId} · ${plan.memberName}` });
    res.json({ plan: plans.present(plan) });
  } catch (err) {
    next(err);
  }
});

router.post("/", canWrite, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const data = parsed.data;
    const member = await Member.findOne({ memberId: data.memberId });
    if (!member) return res.status(404).json({ error: "No member with that ID. Add them on the Members page first." });
    auditNote(res, { target: `No. ${member.memberId} · ${member.fullName}` });
    if (await RetirementPlan.exists({ memberId: data.memberId })) {
      return res.status(409).json({ error: `${member.fullName} already has a retirement plan.` });
    }
    const plan = await RetirementPlan.create({
      ...data,
      startDate: ledger.calendarDay(data.startDate),
      memberName: member.fullName,
      createdByName: req.user.fullName,
    });
    res.status(201).json({ plan: plans.present(plan) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "This member already has a retirement plan." });
    next(err);
  }
});

router.post("/:id/contributions", canWrite, async (req, res, next) => {
  try {
    const parsed = contributionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const plan = await find(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found." });
    const paidAt = ledger.calendarDay(parsed.data.paidAt);
    if (paidAt > ledger.todayInManila()) return res.status(400).json({ error: "The payment date can't be in the future." });
    if (plan.contributions.some((c) => !c.voided && c.month === parsed.data.month)) {
      return res.status(409).json({ error: "That month is already paid. Void the earlier entry first if it was wrong." });
    }
    const dues = parsed.data.dues ?? plan.monthlyContribution - plan.planShare;
    if (parsed.data.amount + dues === 0) return res.status(400).json({ error: "Enter the amount paid." });
    plan.contributions.push({ ...parsed.data, dues, paidAt, source: "manual", recordedByName: req.user.fullName });
    await plan.save();
    res.status(201).json({ plan: plans.present(plan) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/contributions/:contributionId/void", canWrite, async (req, res, next) => {
  try {
    const parsed = voidSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const plan = await find(req.params.id);
    const entry = plan && mongoose.isValidObjectId(req.params.contributionId) ? plan.contributions.id(req.params.contributionId) : null;
    if (plan) auditNote(res, { target: `No. ${plan.memberId} · ${plan.memberName}` });
    if (!entry) return res.status(404).json({ error: "Contribution not found." });
    if (entry.voided) return res.status(409).json({ error: "This contribution was already voided." });
    Object.assign(entry, { voided: true, voidReason: parsed.data.reason, voidedByName: req.user.fullName, voidedAt: new Date() });
    await plan.save();
    res.json({ plan: plans.present(plan) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
