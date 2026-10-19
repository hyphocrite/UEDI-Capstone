const mongoose = require("mongoose");

// A repayment on a loan, in integer centavos. Payments are never deleted; a mistake is voided
// with a reason, and the loan's schedule is recomputed from the payments that remain.
const PAYMENT_METHODS = ["payroll", "cash", "other"];

const paymentSchema = new mongoose.Schema(
  {
    loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true, index: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paidAt: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 60 },
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
