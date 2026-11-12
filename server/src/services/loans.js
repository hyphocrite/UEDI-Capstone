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

/** The borrower's other active loans, for the release form's "Deduct from proceeds" list. */
async function otherActiveLoans(loan) {
  if (!loan.memberId) return [];
  const others = await Loan.find({ memberId: loan.memberId, status: "active", _id: { $ne: loan._id } }).sort({ createdAt: 1 });
  return others.map((l) => ({
    _id: l._id,
    loanNo: l.loanNo,
    loanType: l.loanType,
    balance: ledger.summarize(l.schedule).balance,
    // A renewal of the same kind of loan usually pays off the old one.
    suggested: l.loanType === loan.loanType,
  }));
}

/**
 * Releases a loan. Old loans listed in offsetLoanIds are paid off from the proceeds: each gets an
 * "offset" payment for its full balance, which closes it.
 */
async function release(loan, { releasedAt, voucherNo, offsetLoanIds = [] }, user) {
  if (loan.status !== "for_release") throw new LoanError(409, "This loan was already released.");
  assertNotFuture(releasedAt, "release date");
  const day = ledger.calendarDay(releasedAt);

  // Check every offset before writing anything.
  const ids = [...new Set(offsetLoanIds.map(String))];
  const olds = ids.length ? await Loan.find({ _id: { $in: ids } }) : [];
  if (olds.length !== ids.length) throw new LoanError(400, "One of the loans to deduct was not found.");
  const offsets = [];
  for (const old of olds) {
    if (old._id.equals(loan._id) || !loan.memberId || old.memberId !== loan.memberId) {
      throw new LoanError(400, `${old.loanNo} is not another loan of this borrower.`);
    }
    if (old.status !== "active") throw new LoanError(400, `${old.loanNo} is not active, so there is nothing to deduct.`);
    if (ledger.calendarDay(old.release.releasedAt) > day) throw new LoanError(400, `${old.loanNo} was released after this date.`);
    offsets.push({ old, amount: ledger.summarize(old.schedule).balance });
  }
  const totalOffsets = offsets.reduce((s, o) => s + o.amount, 0);
  const netProceeds = loan.principal - totalOffsets;
  if (netProceeds < 0) {
    throw new LoanError(400, `The old balances (${peso(totalOffsets)}) are more than this loan (${peso(loan.principal)}). Deduct fewer loans.`);
  }

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
          releasedAt: day,
          voucherNo,
          releasedBy: user._id,
          releasedByName: user.fullName,
          netProceeds,
          offsets: offsets.map((o) => ({ loan: o.old._id, loanNo: o.old.loanNo, amount: o.amount })),
        },
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated) throw new LoanError(409, "This loan was already released.");

  for (const { old, amount } of offsets) {
    if (amount <= 0) continue;
    await Payment.create({
      loan: old._id,
      amount,
      paidAt: day,
      method: "offset",
      reference: `Offset by ${updated.loanNo}`,
      offsetBy: updated._id,
      recordedBy: user._id,
      recordedByName: user.fullName,
    });
    await recompute(old);
  }
  return updated;
}

/** Re-applies every non-voided payment to the schedule and updates the status. */
async function recompute(loan, session = null) {
  const payments = await Payment.find({ loan: loan._id, voided: false }).session(session);
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
  await loan.save({ session });
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
  const target = await Payment.findOne({ _id: paymentId, loan: loan._id }).catch(() => null);
  if (target?.deductionRun && !target.voided) {
    throw new LoanError(409, "This payment was posted by a payroll deduction run. To undo it, the Treasurer unposts that run.");
  }
  if (target?.method === "offset") {
    throw new LoanError(409, `This payment closed the loan when ${target.reference?.replace(/^Offset by /, "") || "a new loan"} was released. It can only be undone by cancelling that release.`);
  }
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

const perMonth = (l, installment) => (l.paymentFrequency === "quincenal" ? 2 * installment : installment);

/**
 * The "To be filled up by the Bookkeeper" figures from the ledger: for Long term (long_term loans)
 * and Short term (emergency loans), the total balance of the member's active loans, the latest
 * maturity among them, what they deduct per cutoff and per month, and the loans behind it.
 * Amounts are centavos. hasLoans is true when the member has any loan in the ledger, even paid ones.
 */
async function balancesFor(memberId, asOf = ledger.todayInManila()) {
  const id = String(memberId || "").trim();
  if (!id) return { memberId: id, hasLoans: false, longTerm: emptyGroup(), shortTerm: emptyGroup(), monthlyPayment: 0 };
  const [hasLoans, active] = await Promise.all([Loan.exists({ memberId: id }), Loan.find({ memberId: id, status: "active" }).sort({ createdAt: 1 })]);
  const group = (type) => {
    const loans = active
      .filter((l) => l.loanType === type)
      .map((l) => {
        const s = ledger.summarize(l.schedule, asOf);
        const open = l.schedule.find((x) => x.paid < x.totalDue) ?? l.schedule[l.schedule.length - 1];
        const installment = open ? open.totalDue : 0;
        return { loanId: l._id, loanNo: l.loanNo, balance: s.balance, maturity: s.maturesOn, paymentFrequency: l.paymentFrequency, installment, perMonth: perMonth(l, installment) };
      });
    const maturities = loans.map((l) => l.maturity).filter(Boolean).map((d) => new Date(d).getTime());
    return {
      balance: loans.reduce((s, l) => s + l.balance, 0),
      dueDate: maturities.length ? new Date(Math.max(...maturities)) : null,
      perMonth: loans.reduce((s, l) => s + l.perMonth, 0),
      loans,
    };
  };
  const longTerm = group("long_term");
  const shortTerm = group("emergency");
  return { memberId: id, hasLoans: !!hasLoans, asOf, longTerm, shortTerm, monthlyPayment: longTerm.perMonth + shortTerm.perMonth };
}

function emptyGroup() {
  return { balance: 0, dueDate: null, perMonth: 0, loans: [] };
}

/** balancesFor() in the shape of an application's bookkeeper section (pesos, like the rest of the application). */
function bookkeeperFromLedger(b) {
  const pesos = (c) => c / 100;
  const list = (type, g) => g.loans.map((l) => ({ loanNo: l.loanNo, loanType: type, balance: pesos(l.balance), maturity: l.maturity }));
  return {
    source: "ledger",
    asOf: b.asOf,
    longTermBalance: pesos(b.longTerm.balance),
    longTermDueDate: b.longTerm.dueDate ?? undefined,
    shortTermBalance: pesos(b.shortTerm.balance),
    shortTermDueDate: b.shortTerm.dueDate ?? undefined,
    monthlyPayment: pesos(b.monthlyPayment),
    loans: [...list("long_term", b.longTerm), ...list("emergency", b.shortTerm)],
  };
}

module.exports = {
  LoanError,
  createFromApplication,
  present,
  otherActiveLoans,
  release,
  recordPayment,
  voidPayment,
  recompute,
  balancesFor,
  bookkeeperFromLedger,
};
