// Payroll deduction runs: loading and saving. The math and CSV live in deductions.js.
const mongoose = require("mongoose");
const DeductionRun = require("../models/DeductionRun");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const ledger = require("./ledger");
const d = require("./deductions");
const { LoanError: RunError, recompute } = require("./loans");

/** The run as the API returns it, with totals and each line's result. */
function present(run) {
  const json = run.toJSON();
  json.cutoff = d.dayKey(run.cutoffDate);
  json.totals = d.totals(json.lines);
  return json;
}

async function createRun(cutoffDate, user) {
  if (!d.isCutoff(cutoffDate)) throw new RunError(400, "A cutoff is the 15th or the last day of a month.");
  const cutoff = ledger.calendarDay(cutoffDate);
  if (await DeductionRun.exists({ cutoffDate: cutoff })) throw new RunError(409, `There is already a run for ${d.dayKey(cutoff)}.`);
  const loans = await Loan.find({ status: "active", "schedule.dueDate": cutoff });
  try {
    return await DeductionRun.create({ cutoffDate: cutoff, lines: d.buildLines(loans, cutoff), createdBy: user._id, createdByName: user.fullName });
  } catch (err) {
    if (err?.code === 11000) throw new RunError(409, `There is already a run for ${d.dayKey(cutoff)}.`);
    throw err;
  }
}

function lineOf(run, lineId) {
  const line = mongoose.isValidObjectId(lineId) ? run.lines.id(lineId) : null;
  if (!line) throw new RunError(404, "Line not found.");
  return line;
}

/** Draft only: change the amount to deduct, or take a line off the list with a reason. */
async function editLine(run, lineId, { expected, remove, removedReason }) {
  if (run.status !== "draft") throw new RunError(409, "Only a draft run can be changed. This one was already sent.");
  const line = lineOf(run, lineId);
  if (remove) {
    if (!removedReason?.trim()) throw new RunError(400, "Give a reason for removing this line.");
    line.removed = true;
    line.removedReason = removedReason.trim();
  } else if (remove === false) {
    line.removed = false;
    line.removedReason = undefined;
  }
  if (expected !== undefined) line.expected = expected;
  await run.save();
  return run;
}

/** Draft to sent: the amounts to deduct are locked, and every line's remitted starts at expected. */
async function send(run, user) {
  if (run.status !== "draft") throw new RunError(409, "This run was already sent.");
  for (const line of run.lines) {
    if (line.removed) continue;
    line.remitted = line.expected;
    line.result = d.resultFor(line);
  }
  run.status = "sent";
  run.sentAt = new Date();
  run.sentBy = user._id;
  run.sentByName = user.fullName;
  await run.save();
  return run;
}

async function balancesOf(lines) {
  const loans = await Loan.find({ _id: { $in: d.activeLines(lines).map((l) => l.loan) } });
  return { loans, balances: new Map(loans.map((l) => [String(l._id), ledger.summarize(l.schedule).balance])) };
}

/** Sent only: the O.R. and what payroll deducted per line. Returns problems instead of saving when there are any. */
async function saveRemittance(run, { remittance, lines }) {
  if (run.status !== "sent") throw new RunError(409, run.status === "draft" ? "Send the run first." : "This run was already posted.");
  if (remittance) run.remittance = { ...remittance, receivedAt: remittance.receivedAt ? ledger.calendarDay(remittance.receivedAt) : undefined };
  for (const u of lines ?? []) {
    const line = lineOf(run, u.lineId);
    if (line.removed) continue;
    line.remitted = u.remitted;
    line.reason = u.reason || undefined;
    line.reasonNote = u.reasonNote?.trim() || undefined;
    line.result = d.resultFor(line);
  }
  const { balances } = await balancesOf(run.lines);
  const problems = d.remittanceProblems(run.lines.map((l) => l.toObject()), balances);
  if (problems.length) throw Object.assign(new RunError(400, problems[0]), { problems });
  await run.save();
  return run;
}

let transactionsSupported;
/** Transactions need a replica set or sharded cluster; a plain local mongod has neither. */
async function supportsTransactions() {
  if (transactionsSupported === undefined) {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName || hello.msg === "isdbgrid");
  }
  return transactionsSupported;
}

/**
 * Sent to posted. Every line with something remitted becomes a payroll payment dated the cutoff,
 * allocated through the ledger. All or nothing: every line is checked before anything is written,
 * and writes run in a transaction when MongoDB supports one (otherwise they are undone on failure).
 */
async function post(run, user) {
  if (run.status === "posted") throw new RunError(409, "This run was already posted.");
  if (run.status !== "sent") throw new RunError(409, "Send the run before posting it.");
  const r = run.remittance ?? {};
  if (!r.officialReceiptNo || r.amountReceived === undefined || r.amountReceived === null || !r.receivedAt) {
    throw new RunError(400, "Enter the remittance: O.R. number, amount received and date.");
  }
  if (run.cutoffDate > ledger.todayInManila()) throw new RunError(400, "A run can only be posted on or after its cutoff date.");

  const locked = await DeductionRun.findOneAndUpdate({ _id: run._id, status: "sent", posting: { $ne: true } }, { $set: { posting: true } }, { returnDocument: "after" });
  if (!locked) throw new RunError(409, "This run is already being posted, or was posted.");
  try {
    const { loans, balances } = await balancesOf(locked.lines);
    const lines = d.activeLines(locked.lines.map((l) => l.toObject()));
    const problems = d.remittanceProblems(lines, balances);
    for (const l of lines) {
      const loan = loans.find((x) => x._id.equals(l.loan));
      if (!loan || (loan.status !== "active" && l.remitted > 0)) problems.push(`${l.loanNo}: the loan is no longer active.`);
    }
    if (problems.length) throw Object.assign(new RunError(400, problems[0]), { problems });

    const write = async (session) => {
      const created = [];
      for (const l of lines.filter((x) => x.remitted > 0)) {
        const [p] = await Payment.create(
          [{ loan: l.loan, amount: l.remitted, paidAt: locked.cutoffDate, method: "payroll", reference: `Payroll run ${d.dayKey(locked.cutoffDate)}`, deductionRun: locked._id, recordedBy: user._id, recordedByName: user.fullName }],
          { session },
        );
        created.push(p._id);
      }
      for (const loan of loans) {
        const l = lines.find((x) => loan._id.equals(x.loan));
        const last = loan.lastDeduction?.cutoffDate;
        if (!last || locked.cutoffDate >= last) {
          loan.lastDeduction = { run: locked._id, cutoffDate: locked.cutoffDate, result: d.resultFor(l), reason: l.reason, reasonNote: l.reasonNote };
        }
        if (l.reason === "separated" && !loan.collectFrom?.source) {
          // TODO: collect the balance from final pay or the retirement plan (not built yet).
          loan.collectFrom = { source: "final_pay", run: locked._id, cutoffDate: locked.cutoffDate };
        }
        await recompute(loan, session);
      }
      locked.lines.forEach((line) => {
        if (!line.removed) line.result = d.resultFor(line);
      });
      Object.assign(locked, { status: "posted", posting: false, postedAt: new Date(), postedBy: user._id, postedByName: user.fullName });
      await locked.save({ session });
      return created;
    };

    if (await supportsTransactions()) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(() => write(session));
      } finally {
        await session.endSession();
      }
    } else {
      try {
        await write(null);
      } catch (err) {
        await undoPayments(locked, user, "Posting failed and was rolled back.");
        await restoreLoanFlags(locked._id);
        throw err;
      }
    }
    return locked;
  } catch (err) {
    await DeductionRun.updateOne({ _id: run._id, status: "sent" }, { $set: { posting: false } });
    throw err;
  }
}

/** Voids every payment a run posted and recomputes those loans. */
async function undoPayments(run, user, reason) {
  const payments = await Payment.find({ deductionRun: run._id, voided: false });
  await Payment.updateMany(
    { _id: { $in: payments.map((p) => p._id) } },
    { $set: { voided: true, voidReason: reason, voidedBy: user._id, voidedByName: user.fullName, voidedAt: new Date() } },
  );
  const loans = await Loan.find({ _id: { $in: [...new Set(payments.map((p) => String(p.loan)))] } });
  for (const loan of loans) await recompute(loan);
}

/** Treasurer only: voids the run's payments and returns it to sent so it can be corrected and posted again. */
async function unpost(run, reason, user) {
  if (run.status !== "posted") throw new RunError(409, "Only a posted run can be unposted.");
  const updated = await DeductionRun.findOneAndUpdate(
    { _id: run._id, status: "posted" },
    { $set: { status: "sent" }, $unset: { postedAt: "", postedBy: "", postedByName: "" }, $push: { unposts: { reason, by: user._id, byName: user.fullName, at: new Date() } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new RunError(409, "Only a posted run can be unposted.");
  await undoPayments(updated, user, `Run unposted: ${reason}`);
  await restoreLoanFlags(run._id);
  return updated;
}

/** Puts each loan's missed-deduction and separated flags back to what they were without this run. */
async function restoreLoanFlags(runId) {
  const loans = await Loan.find({ $or: [{ "lastDeduction.run": runId }, { "collectFrom.run": runId }] });
  for (const loan of loans) {
    if (loan.collectFrom?.run?.equals(runId)) loan.collectFrom = undefined;
    if (loan.lastDeduction?.run?.equals(runId)) {
      const prev = await DeductionRun.findOne({ _id: { $ne: runId }, status: "posted", lines: { $elemMatch: { loan: loan._id, removed: { $ne: true } } } }).sort({ cutoffDate: -1 });
      const line = prev?.lines.find((l) => l.loan.equals(loan._id) && !l.removed);
      loan.lastDeduction = line ? { run: prev._id, cutoffDate: prev.cutoffDate, result: line.result, reason: line.reason, reasonNote: line.reasonNote } : undefined;
    }
    await loan.save();
  }
}

module.exports = { RunError, present, createRun, editLine, send, saveRemittance, post, unpost };
