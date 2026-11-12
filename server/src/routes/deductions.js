const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const DeductionRun = require("../models/DeductionRun");
const d = require("../services/deductions");
const runs = require("../services/deductionRuns");
const ledger = require("../services/ledger");
const { auditNote } = require("../middleware/audit");
const { requireAuth, requireRole } = require("../middleware/auth");

// Payroll deduction runs. Amounts are integer centavos.
const router = express.Router();
router.use(requireAuth, requireRole("bookkeeper", "treasurer", "admin"));
const canWrite = requireRole("bookkeeper", "treasurer");

const calendarDate = (what) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${what}.`);
const centavos = z.coerce.number().int().min(0).max(100_000_000_00);

const createSchema = z.object({ cutoffDate: calendarDate("cutoff date") });
const lineEditSchema = z.object({
  expected: centavos.optional(),
  remove: z.boolean().optional(),
  removedReason: z.string().trim().max(300).optional(),
});
const remittanceSchema = z.object({
  remittance: z
    .object({
      officialReceiptNo: z.string().trim().max(40).optional(),
      amountReceived: centavos.optional(),
      receivedAt: calendarDate("date received").optional(),
    })
    .optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string(),
        remitted: centavos,
        reason: z.enum(d.REASONS).optional().or(z.literal("")),
        reasonNote: z.string().trim().max(300).optional(),
      }),
    )
    .max(2000)
    .optional(),
});
const importSchema = z.object({ csv: z.string().min(1, "The file is empty.").max(2_000_000) });
const unpostSchema = z.object({ reason: z.string().trim().min(3, "Give a reason for unposting.").max(300) });

/** Runs a handler; RunError becomes its status, with every problem listed when there are several. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof runs.RunError) return res.status(err.status).json({ error: err.message, problems: err.problems });
    next(err);
  }
};

const parse = (schema, req, res) => {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) res.status(400).json({ error: parsed.error.issues[0].message });
  return parsed.success ? parsed.data : null;
};

async function findRun(req, res) {
  const run = mongoose.isValidObjectId(req.params.id) ? await DeductionRun.findById(req.params.id) : null;
  if (!run) res.status(404).json({ error: "Run not found." });
  else auditNote(res, { target: `Run for ${ledger.calendarDay(run.cutoffDate).toISOString().slice(0, 10)} cutoff` });
  return run;
}

router.get(
  "/",
  handle(async (_req, res) => {
    const all = await DeductionRun.find().sort({ cutoffDate: -1 }).limit(200);
    const list = all.map((r) => {
      const { lines, ...rest } = runs.present(r);
      return { ...rest, lineCount: lines.length };
    });
    const suggestedCutoff = d.dayKey(d.suggestCutoff(ledger.todayInManila(), all.map((r) => r.cutoffDate)));
    res.json({ runs: list, suggestedCutoff });
  }),
);

router.post(
  "/",
  canWrite,
  handle(async (req, res) => {
    const body = parse(createSchema, req, res);
    if (!body) return;
    const run = await runs.createRun(body.cutoffDate, req.user);
    res.status(201).json({ run: runs.present(run) });
  }),
);

router.get(
  "/:id",
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(run) });
  }),
);

// The list for DNSC's Payroll Officer.
router.get(
  "/:id/export.csv",
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (!run) return;
    if (run.status === "draft") return res.status(409).json({ error: "Send the run before downloading the list." });
    const cutoff = d.dayKey(run.cutoffDate);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="uedi-payroll-deductions-${cutoff}.csv"`);
    // BOM so Excel reads UTF-8 names (such as ñ) correctly.
    res.send(`﻿${d.deductionListCsv(run.lines, { withRemitted: req.query.remitted === "1" })}`);
  }),
);

router.patch(
  "/:id/lines/:lineId",
  canWrite,
  handle(async (req, res) => {
    const body = parse(lineEditSchema, req, res);
    if (!body) return;
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(await runs.editLine(run, req.params.lineId, body)) });
  }),
);

router.post(
  "/:id/send",
  canWrite,
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(await runs.send(run, req.user)) });
  }),
);

router.put(
  "/:id/remittance",
  canWrite,
  handle(async (req, res) => {
    const body = parse(remittanceSchema, req, res);
    if (!body) return;
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(await runs.saveRemittance(run, body)) });
  }),
);

// Reads remitted amounts from a CSV and returns them for the form; nothing is saved here.
router.post(
  "/:id/import",
  canWrite,
  handle(async (req, res) => {
    const body = parse(importSchema, req, res);
    if (!body) return;
    const run = await findRun(req, res);
    if (!run) return;
    if (run.status !== "sent") return res.status(409).json({ error: "Remitted amounts can only be imported on a sent run." });
    res.json(d.parseRemittedCsv(body.csv, run.lines));
  }),
);

router.post(
  "/:id/post",
  canWrite,
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(await runs.post(run, req.user)) });
  }),
);

router.post(
  "/:id/unpost",
  requireRole("treasurer"),
  handle(async (req, res) => {
    const body = parse(unpostSchema, req, res);
    if (!body) return;
    const run = await findRun(req, res);
    if (run) res.json({ run: runs.present(await runs.unpost(run, body.reason, req.user)) });
  }),
);

module.exports = router;
