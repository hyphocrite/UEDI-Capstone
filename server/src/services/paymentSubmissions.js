// Payments outside payroll: cash, e-money (GCash, Maya, QR) and bank transfers. They reach the
// ledger in two steps, as UDEI does it on paper:
//   1. the Treasurer receives the money (or checks the transfer came in) and issues the Official
//      Receipt (OR): submitted → received;
//   2. the Bookkeeper confirms, and only then is the payment recorded on the loan: received → posted.
// Either can reject it with a reason instead. These are advance payments: payroll deduction keeps
// running at the same amount (see deductions.amountsFor). Amounts are integer centavos.
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const PaymentSubmission = require("../models/PaymentSubmission");
const User = require("../models/User");
const ledger = require("./ledger");
const { seesAllLoans } = require("../config/access");
const loans = require("./loans");
const mailer = require("./mailer");

const { LoanError } = loans;

/** How each payment method reads on screen, everywhere (client/src/lib/payments.ts mirrors this). */
const METHOD_LABELS = {
  payroll: "Payroll",
  cash: "Cash",
  e_money: "E-money",
  bank_transfer: "Bank transfer",
  other: "Other",
  offset: "Offset",
};

const peso = (c) => `PHP ${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Whether the user is the borrower: their linked member ID, or a member's own account that filed
 * the application. Office staff who typed in someone's application are not the borrower.
 */
async function ownsLoan(user, loan) {
  const memberId = user.memberId || null;
  if (memberId && loan.memberId === memberId) return true;
  if (!loan.application || seesAllLoans(user)) return false;
  return !!(await Application.exists({ _id: loan.application, submittedBy: user._id }));
}

/** The accounts of the borrower, to email. */
async function borrowerAccounts(loan) {
  const ids = new Set();
  if (loan.memberId) (await User.find({ memberId: loan.memberId }).select("_id")).forEach((u) => ids.add(String(u._id)));
  if (loan.application) {
    const app = await Application.findById(loan.application).select("submittedBy");
    if (app?.submittedBy) ids.add(String(app.submittedBy));
  }
  return User.find({ _id: { $in: [...ids] } }).select("email fullName");
}

/** Checks a new submission and saves it. `source` is "member" (the borrower) or "office" (walk-in). */
async function create(loan, data, user, source) {
  if (loan.status === "for_release") throw new LoanError(409, "This mutual assistance isn't released yet, so there is nothing to pay.");
  if (loan.status === "paid") throw new LoanError(409, "This mutual assistance is already fully paid.");
  if (ledger.calendarDay(data.paidAt) > ledger.todayInManila()) throw new LoanError(400, "The date paid can't be in the future.");
  if (ledger.calendarDay(data.paidAt) < ledger.calendarDay(loan.release.releasedAt)) {
    throw new LoanError(400, "The date paid is before the mutual assistance was released.");
  }
  if (data.method !== "cash" && !data.reference) {
    throw new LoanError(400, `Enter the ${data.method === "e_money" ? "e-money" : "bank"} reference number.`);
  }
  const { balance } = ledger.summarize(loan.schedule);
  if (data.amount > balance) throw new LoanError(400, `The amount is more than the remaining balance of ${peso(balance)}.`);
  return PaymentSubmission.create({
    loan: loan._id,
    loanNo: loan.loanNo,
    memberId: loan.memberId,
    borrowerName: loan.borrowerName,
    amount: data.amount,
    method: data.method,
    paidAt: ledger.calendarDay(data.paidAt),
    reference: data.reference || undefined,
    note: data.note || undefined,
    submittedBy: user._id,
    submittedByName: user.fullName,
    source,
  });
}

/** Attaches (or replaces) the proof photo or PDF while the submission waits for the Treasurer. */
async function attachProof(sub, proof) {
  const updated = await PaymentSubmission.findOneAndUpdate({ _id: sub._id, status: "submitted" }, { $set: { proof } }, { returnDocument: "after" });
  if (!updated) throw new LoanError(409, "The proof can only be changed before the Treasurer receives the payment.");
  return updated;
}

/** Treasurer: the money came in and the Official Receipt was issued. */
async function receive(sub, { orNumber, receivedAt }, user) {
  if (sub.status !== "submitted") throw new LoanError(409, `This payment was already ${sub.status}.`);
  if (sub.source === "member" && sub.method !== "cash" && !sub.proof?.fileId) {
    throw new LoanError(409, "Wait for the member's proof of payment, or check the transfer and reject it if it didn't come in.");
  }
  if (ledger.calendarDay(receivedAt) > ledger.todayInManila()) throw new LoanError(400, "The date received can't be in the future.");
  if (ledger.calendarDay(receivedAt) < ledger.calendarDay(sub.paidAt)) throw new LoanError(400, "The date received is before the date paid.");
  if (await PaymentSubmission.exists({ "received.orNumber": orNumber })) throw new LoanError(409, `OR ${orNumber} was already used.`);
  try {
    const updated = await PaymentSubmission.findOneAndUpdate(
      { _id: sub._id, status: "submitted" },
      { $set: { status: "received", received: { orNumber, receivedAt: ledger.calendarDay(receivedAt), by: user._id, byName: user.fullName, at: new Date() } } },
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) throw new LoanError(409, "This payment changed in the meantime. Reload and try again.");
    return updated;
  } catch (err) {
    if (err?.code === 11000) throw new LoanError(409, `OR ${orNumber} was already used.`);
    throw err;
  }
}

/**
 * Bookkeeper: records the Payment (method, OR number, reference) and recomputes the loan. More than
 * the remaining balance is refused with 409 and the submission stays received.
 */
async function confirm(sub, user) {
  if (sub.status !== "received") {
    throw new LoanError(409, sub.status === "submitted" ? "The Treasurer must receive this payment and issue the OR first." : `This payment was already ${sub.status}.`);
  }
  const locked = await PaymentSubmission.findOneAndUpdate({ _id: sub._id, status: "received", posting: { $ne: true } }, { $set: { posting: true } }, { returnDocument: "after" });
  if (!locked) throw new LoanError(409, "This payment is already being confirmed. Reload the list.");
  const unlock = () => PaymentSubmission.updateOne({ _id: sub._id }, { $set: { posting: false } });
  try {
    const loan = await Loan.findById(locked.loan);
    if (!loan) throw new LoanError(404, "The mutual assistance of this payment was not found.");
    if (loan.status === "paid") throw new LoanError(409, "This mutual assistance is already fully paid. Reject the payment and refund it.");
    const { balance } = ledger.summarize(loan.schedule);
    if (locked.amount > balance) {
      throw new LoanError(409, `${peso(locked.amount)} is more than the remaining balance of ${peso(balance)}. Reject it and refund the difference, or ask the Treasurer to correct it.`);
    }
    let result;
    try {
      result = await loans.recordPayment(
        loan,
        {
          amount: locked.amount,
          paidAt: locked.paidAt.toISOString().slice(0, 10),
          method: locked.method,
          reference: locked.reference,
          orNumber: locked.received.orNumber,
          paymentSubmission: locked._id,
        },
        user,
      );
    } catch (err) {
      if (err instanceof LoanError && err.status === 400) throw new LoanError(409, err.message);
      throw err;
    }
    const posted = await PaymentSubmission.findOneAndUpdate(
      { _id: locked._id },
      { $set: { status: "posted", posting: false, payment: result.payment._id, confirmed: { by: user._id, byName: user.fullName, at: new Date() } } },
      { returnDocument: "after" },
    );
    return { submission: posted, loan: result.loan, payment: result.payment };
  } catch (err) {
    await unlock();
    throw err;
  }
}

/** The Treasurer rejects at submitted, the Bookkeeper at received. A reason is required. */
async function reject(sub, reason, user) {
  const step = user.role === "treasurer" ? "submitted" : user.role === "bookkeeper" ? "received" : null;
  if (!step) throw new LoanError(403, "Only the Treasurer or the Bookkeeper can reject a payment.");
  if (sub.status !== step) {
    if (["posted", "rejected"].includes(sub.status)) throw new LoanError(409, `This payment was already ${sub.status}.`);
    throw new LoanError(403, step === "submitted" ? "The Bookkeeper rejects a payment once it was received." : "The Treasurer rejects a payment before receiving it.");
  }
  const updated = await PaymentSubmission.findOneAndUpdate(
    { _id: sub._id, status: step, posting: { $ne: true } },
    { $set: { status: "rejected", rejected: { reason, by: user._id, byName: user.fullName, at: new Date() } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new LoanError(409, "This payment changed in the meantime. Reload and try again.");
  return updated;
}

/** The submission as the API returns it. Staff and the borrower see the same fields. */
function view(sub) {
  const s = sub.toJSON ? sub.toJSON() : sub;
  const { proof, posting: _posting, ...rest } = s;
  return {
    ...rest,
    methodLabel: METHOD_LABELS[s.method] || s.method,
    proof: proof?.fileId ? { fileName: proof.fileName, contentType: proof.contentType, uploadedAt: proof.uploadedAt } : null,
  };
}

/** Emails the borrower when their payment is posted or rejected. Best effort. */
async function notifyMember(sub, kind) {
  try {
    const loan = await Loan.findById(sub.loan).select("memberId application loanNo");
    if (!loan) return;
    const users = await borrowerAccounts(loan);
    const what = `${METHOD_LABELS[sub.method].toLowerCase()} payment of ${peso(sub.amount)} on mutual assistance ${sub.loanNo}`;
    const subject = kind === "posted" ? `Your payment on ${sub.loanNo} was posted` : `Your payment on ${sub.loanNo} was not accepted`;
    const text =
      kind === "posted"
        ? `Your ${what} was confirmed and posted to your ledger (OR ${sub.received.orNumber}). Your payroll deduction keeps running at the same amount, so your mutual assistance finishes earlier.`
        : `Your ${what} was not accepted. Reason: "${sub.rejected.reason}"\nIf you paid, bring your receipt to the UDEI office or send it again with the correct details.`;
    await Promise.all(
      users.map((u) =>
        mailer
          .send({ to: u.email, subject, text: `Hello ${u.fullName},\n\n${text}\n\nUDEI Mutual Assistance`, html: `<p>Hello ${u.fullName},</p><p>${text.replace(/\n/g, "<br>")}</p><p>UDEI Mutual Assistance</p>` })
          .catch((err) => console.error("Payment email failed:", err.message)),
      ),
    );
  } catch (err) {
    console.error("Payment email failed:", err.message);
  }
}

module.exports = { METHOD_LABELS, ownsLoan, create, attachProof, receive, confirm, reject, view, notifyMember };
