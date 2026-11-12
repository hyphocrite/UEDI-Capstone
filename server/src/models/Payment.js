const mongoose = require("mongoose");

// A repayment on a loan, in integer centavos. Payments are never deleted; a mistake is voided
// with a reason, and the loan's schedule is recomputed from the payments that remain.
// "offset": paid off from a new loan's proceeds at its release. It can't be voided on its own.
const PAYMENT_METHODS = ["payroll", "cash", "other", "offset"];

const paymentSchema = new mongoose.Schema(
  {
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true, index: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paidAt: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 60 },
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
