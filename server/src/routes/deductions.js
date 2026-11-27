const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const DeductionRun = require("../models/DeductionRun");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const remittanceImport = require("../services/remittanceImport");
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

const createSchema = z.object({
  cutoffDate: calendarDate("cutoff date"),
  // "bonus": a run for one bonus release (Mid-year, Year-end, CNA or SRI) on cutoffDate.
  kind: z.enum(["payroll", "bonus"]).default("payroll"),
  bonusType: z.enum(["mid_year", "year_end", "cna", "sri"]).optional(),
});
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
const mappingText = z.string().trim().max(120).optional();
const importSettingsSchema = z.object({
  sheet: z.string().trim().max(120).optional(),
  mapping: z.object({ amount: mappingText, loanNo: mappingText, memberNo: mappingText, employeeNo: mappingText, name: mappingText, lastName: mappingText, firstName: mappingText }),
});
// Accounting's remittance list: .xlsx or .csv (old .xls gets a message asking for .xlsx).
const SPREADSHEET_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv", "application/csv", "text/plain", "application/octet-stream"];
const MAX_LIST_BYTES = 5 * 1024 * 1024;
const unpostSchema = z.object({ reason: z.string().trim().min(3, "Give a reason for unposting.").max(300) });

/** Runs a handler; RunError becomes its status, with every problem listed when there are several. */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof runs.RunError) return res.status(err.status).json({ error: err.message, problems: err.problems });
    if (err instanceof remittanceImport.ImportError) return res.status(400).json({ error: err.message });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "The remittance list can be at most 5 MB." });
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
    const suggestedCutoff = d.dayKey(d.suggestCutoff(ledger.todayInManila(), all.filter((r) => r.kind !== "bonus").map((r) => r.cutoffDate)));
    res.json({ runs: list, suggestedCutoff });
  }),
);

router.post(
  "/",
  canWrite,
  handle(async (req, res) => {
    const body = parse(createSchema, req, res);
    if (!body) return;
    const run = await runs.createRun(body.cutoffDate, req.user, { kind: body.kind, bonusType: body.bonusType });
    res.status(201).json({ run: runs.present(run) });
  }),
);

// Remembers which sheet and columns the Bookkeeper confirmed on the last remittance list.
router.put(
  "/import-settings",
  canWrite,
  handle(async (req, res) => {
    const body = parse(importSettingsSchema, req, res);
    if (!body) return;
    const remembered = { ...body, savedByName: req.user.fullName, savedAt: new Date() };
    await Setting.updateOne({ key: "loan" }, { $set: { remittanceImport: remembered } });
    res.json({ remittanceImport: remembered });
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

// Reads DNSC Accounting's remittance list (.xlsx or .csv) and matches each row to a line of this sent
// run. Returns the review (matched, ambiguous, not found, lines with no row); nothing is saved here.
// ?sheet= and ?amount= re-read it with another sheet or amount column.
router.post(
  "/:id/remittance-file",
  canWrite,
  express.raw({ type: SPREADSHEET_TYPES, limit: MAX_LIST_BYTES }),
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (!run) return;
    if (run.status !== "sent") return res.status(409).json({ error: "The remittance list can only be read on a sent run." });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Upload the remittance list as .xlsx or .csv." });
    const fileName = String(req.query.name || "").slice(0, 255);
    const sheets = await remittanceImport.readWorkbook(req.body, fileName);
    const memberIds = [...new Set(d.activeLines(run.lines).map((l) => l.memberId).filter(Boolean))];
    const [members, setting] = await Promise.all([
      Member.find({ memberId: { $in: memberIds } }).select("memberId employeeNo").lean(),
      Setting.findOne({ key: "loan" }).select("remittanceImport").lean(),
    ]);
    const saved = setting?.remittanceImport || {};
    const result = remittanceImport.preview(sheets, run.lines.map((l) => l.toObject()), members, {
      sheet: typeof req.query.sheet === "string" ? req.query.sheet : saved.sheet,
      amountColumn: typeof req.query.amount === "string" ? req.query.amount : undefined,
      mapping: saved.mapping,
    });
    auditNote(res, { details: { fileName, size: req.body.length, sheet: result.sheet, amountColumn: result.amountColumn, counts: result.counts } });
    res.json({ ...result, fileName, remembered: !!saved.mapping?.amount });
  }),
);

router.post(
  "/:id/post",
  canWrite,
  handle(async (req, res) => {
    const run = await findRun(req, res);
    if (!run) return;
    const posted = await runs.post(run, req.user);
    // Co-makers hear about missed or partial deductions on loans they vouched for. Best effort.
    require("../services/coMakers").notifyMissed(posted.lines).catch((err) => console.error("Co-maker alerts failed:", err.message));
    res.json({ run: runs.present(posted) });
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
