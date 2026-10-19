// Loan lifecycle: created on the President's approval, released by the Treasurer, then repaid.
// The math lives in ledger.js; this module loads and saves.
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const Payment = require("../models/Payment");
const ledger = require("./ledger");

class LoanError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const peso = (centavos) =>
  `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function nextLoanNo() {
  const year = new Date().getFullYear();
  const count = await Loan.countDocuments({ loanNo: new RegExp(`^MA-${year}-`) });
  return `MA-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Creates the loan for an approved application. Safe to call twice: the second call returns the first loan. */
async function createFromApplication(app) {
  const existing = await Loan.findOne({ application: app._id });
  if (existing) return existing;
  const books = app.bookkeeper || {};
  let loan;
  for (let attempt = 0; attempt < 3 && !loan; attempt++) {
    try {
      loan = await Loan.create({
        loanNo: await nextLoanNo(),
        application: app._id,
        applicationNo: app.applicationNo,
        borrowerName: app.applicant.fullName,
        memberId: app.applicant.memberId,
        loanType: app.loan.loanType,
        principal: ledger.toCentavos(app.loan.amount),
        monthlyRate: app.loan.monthlyRate,
        termMonths: app.loan.termMonths,
        paymentFrequency: app.loan.paymentFrequency || "monthly",
        existingBalances: ledger.toCentavos((books.longTermBalance || 0) + (books.shortTermBalance || 0)),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      if (err.keyPattern?.application) return Loan.findOne({ application: app._id });
      // otherwise a loan number clash: try the next number
    }
  }
  await Application.updateOne({ _id: app._id }, { $set: { loanId: loan._id, loanNo: loan.loanNo } });
  return loan;
}

/** The loan as the API returns it: stored fields plus balance, amount paid, next due and past due. */
function present(loan, today = ledger.todayInManila()) {
  return { ...loan.toJSON(), ...ledger.summarize(loan.schedule, today) };
}

function assertNotFuture(date, what) {
  if (ledger.calendarDay(date) > ledger.todayInManila()) throw new LoanError(400, `The ${what} can't be in the future.`);
}

async function release(loan, { releasedAt, voucherNo }, user) {
  if (loan.status !== "for_release") throw new LoanError(409, "This loan was already released.");
  assertNotFuture(releasedAt, "release date");
  const schedule = ledger.buildSchedule({
    principal: loan.principal,
    monthlyRate: loan.monthlyRate,
    termMonths: loan.termMonths,
    paymentFrequency: loan.paymentFrequency,
    releasedAt,
  });
  const updated = await Loan.findOneAndUpdate(
    { _id: loan._id, status: "for_release" },
    {
      $set: {
        status: "active",
        schedule,
        release: {
          releasedAt: ledger.calendarDay(releasedAt),
          voucherNo,
          releasedBy: user._id,
          releasedByName: user.fullName,
          // Shown to the Treasurer; the old balances are not settled here yet.
          netProceeds: loan.principal - loan.existingBalances,
        },
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated) throw new LoanError(409, "This loan was already released.");
  return updated;
}

/** Re-applies every non-voided payment to the schedule and updates the status. */
async function recompute(loan) {
  const payments = await Payment.find({ loan: loan._id, voided: false });
  const { schedule, unapplied } = ledger.allocate(loan.schedule.map((x) => x.toObject()), payments);
  const { balance, maturesOn } = ledger.summarize(schedule);
  loan.schedule = schedule;
  if (loan.status !== "for_release") {
    loan.status = balance === 0 ? "paid" : "active";
    loan.paidOffAt = balance === 0 ? (loan.paidOffAt ?? new Date()) : undefined;
  }
  if (balance > 0 && maturesOn && new Date(maturesOn) < ledger.todayInManila()) {
    // TODO: automatic re-structuring at maturity (the applicant agreed to it on the form,
    // application.agreement.autoRestructure). Not built yet; the loan just stays active and past due.
  }
  await loan.save();
  return { loan, unapplied };
}

async function recordPayment(loan, { amount, paidAt, method, reference }, user) {
  if (loan.status === "for_release") throw new LoanError(409, "Release the loan before recording payments.");
  if (loan.status === "paid") throw new LoanError(409, "This loan is already fully paid.");
  assertNotFuture(paidAt, "payment date");
  if (ledger.calendarDay(paidAt) < ledger.calendarDay(loan.release.releasedAt)) {
    throw new LoanError(400, "The payment date is before the loan was released.");
  }
  const { balance } = ledger.summarize(loan.schedule);
  if (amount > balance) throw new LoanError(400, `The payment is more than the remaining balance of ${peso(balance)}.`);

  const payment = await Payment.create({
    loan: loan._id,
    amount,
    paidAt: ledger.calendarDay(paidAt),
    method,
    reference,
    recordedBy: user._id,
    recordedByName: user.fullName,
  });
  const result = await recompute(loan);
  if (result.unapplied > 0) {
    // Another payment was recorded at the same moment and this one no longer fits. Payments are
    // never deleted, so void it and report the overpayment.
    await voidPayment(result.loan, payment._id, "Automatically voided: more than the remaining balance.", user);
    throw new LoanError(400, "The payment is more than the remaining balance. Reload the loan and try again.");
  }
  return { loan: result.loan, payment };
}

async function voidPayment(loan, paymentId, reason, user) {
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, loan: loan._id, voided: false },
    { $set: { voided: true, voidReason: reason, voidedBy: user._id, voidedByName: user.fullName, voidedAt: new Date() } },
    { returnDocument: "after" },
  ).catch(() => null);
  if (!payment) {
    const exists = await Payment.exists({ _id: paymentId, loan: loan._id }).catch(() => null);
    throw new LoanError(exists ? 409 : 404, exists ? "This payment was already voided." : "Payment not found.");
  }
  const { loan: updated } = await recompute(loan);
  return { loan: updated, payment };
}

module.exports = { LoanError, createFromApplication, present, release, recordPayment, voidPayment, recompute };
