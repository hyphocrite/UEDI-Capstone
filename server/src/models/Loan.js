const mongoose = require("mongoose");
const { LOAN_TYPES, PAYMENT_FREQUENCIES } = require("./Application");

// A Mutual Assistance loan, created when the President approves an application.
// Every money field is an integer number of centavos (₱1 = 100). See services/ledger.js.
const LOAN_STATUSES = ["for_release", "active", "paid"]; // "past due" is computed, not stored

const centavos = { type: Number, required: true, validate: Number.isInteger };

const installmentSchema = new mongoose.Schema(
  {
    no: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    principalDue: centavos,
    interestDue: centavos,
    totalDue: centavos,
    // Recomputed from the payments whenever one is recorded or voided.
    paid: { ...centavos, default: 0 },
    interestPaid: { ...centavos, default: 0 },
    principalPaid: { ...centavos, default: 0 },
  },
  { _id: false },
);

const loanSchema = new mongoose.Schema(
  {
    loanNo: { type: String, required: true, unique: true },
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true, unique: true },
    applicationNo: String,
    borrowerName: { type: String, required: true, trim: true },
    memberId: String,
    loanType: { type: String, enum: LOAN_TYPES, required: true },
    principal: centavos,
    monthlyRate: { type: Number, required: true, min: 0 }, // percent per month
    termMonths: { type: Number, required: true, min: 1 },
    paymentFrequency: { type: String, enum: PAYMENT_FREQUENCIES, required: true },
    // Long-term + short-term balances from the Bookkeeper section, deducted from the release.
    existingBalances: { ...centavos, default: 0 },
    status: { type: String, enum: LOAN_STATUSES, default: "for_release", index: true },
    release: {
      releasedAt: Date,
      voucherNo: { type: String, trim: true, maxlength: 40 },
      releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      releasedByName: String,
      netProceeds: { type: Number, validate: Number.isInteger },
    },
    schedule: [installmentSchema],
    paidOffAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Loan", loanSchema);
module.exports.LOAN_STATUSES = LOAN_STATUSES;
