const mongoose = require("mongoose");

// A repayment on a loan, in integer centavos. Payments are never deleted; a mistake is voided
// with a reason, and the loan's schedule is recomputed from the payments that remain.
// "offset": paid off from a new loan's proceeds at its release. It can't be voided on its own.
// Cash, e-money and bank transfers reach the ledger through a PaymentSubmission (received by the
// Treasurer with an OR, confirmed by the Bookkeeper). "other" stays for older records and corrections.
const PAYMENT_METHODS = ["payroll", "cash", "e_money", "bank_transfer", "other", "offset"];

const paymentSchema = new mongoose.Schema(
  {
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true, index: true },
    // What reduces the balance: the gross received less the service fee.
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    // The service fee taken from this payment (Settings.serviceFee; 1% of payroll postings by
    // default) and the gross received. Payments from before the fee have serviceFee 0 and no
    // grossAmount (the gross is then the amount).
    serviceFee: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    grossAmount: { type: Number, min: 0, validate: Number.isInteger },
    paidAt: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 60 },
    // The Treasurer's Official Receipt number (cash, e-money, bank transfer). Payroll has none.
    orNumber: { type: String, trim: true, maxlength: 30 },
    // The submission this payment came from (cash, e-money, bank transfer).
    paymentSubmission: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentSubmission" },
    // The new loan whose release paid this one off (method "offset").
    offsetBy: { type: mongoose.Schema.Types.ObjectId, ref: "Loan" },
    // The payroll deduction run that posted this payment (method "payroll").
    deductionRun: { type: mongoose.Schema.Types.ObjectId, ref: "DeductionRun", index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recordedByName: String,
    voided: { type: Boolean, default: false },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedByName: String,
    voidedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
