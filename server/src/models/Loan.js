const mongoose = require("mongoose");
const { LOAN_TYPES, PAYMENT_FREQUENCIES } = require("./Application");

// A Mutual Assistance loan, created when the President approves an application, or from a balance
// carried over from UDEI's spreadsheet ledger once the Bookkeeper sets its payroll deduction (source "ledger").
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
    source: { type: String, enum: ["application", "ledger"], default: "application" },
    // Unique when set (index below); ledger loans have no application.
    application: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
    applicationNo: String,
    borrowerName: { type: String, required: true, trim: true },
    memberId: String,
    loanType: { type: String, enum: LOAN_TYPES, required: true },
    principal: centavos,
    monthlyRate: { type: Number, required: true, min: 0 }, // percent per month
    termMonths: { type: Number, required: true, min: 1 },
    paymentFrequency: { type: String, enum: PAYMENT_FREQUENCIES, required: true },
    // Long-term + short-term balances from the application's Bookkeeper section, for reference.
    // What is actually deducted at release is release.offsets.
    existingBalances: { ...centavos, default: 0 },
    status: { type: String, enum: LOAN_STATUSES, default: "for_release", index: true },
    release: {
      releasedAt: Date,
      voucherNo: { type: String, trim: true, maxlength: 40 },
      releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      releasedByName: String,
      // Principal minus the old loans paid off from it (offsets).
      netProceeds: { type: Number, validate: Number.isInteger },
      offsets: [
        new mongoose.Schema(
          { loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan" }, loanNo: String, amount: centavos },
          { _id: false },
        ),
      ],
    },
    schedule: [installmentSchema],
    paidOffAt: Date,
    // Set when a payroll run marks the borrower separated from DNSC: payroll won't deduct again.
    // TODO: collection from final pay or the retirement plan is not built yet.
    // (Named collectFrom because Mongoose reserves "collection" on documents.)
    collectFrom: {
      source: { type: String, enum: ["final_pay"] },
      run: { type: mongoose.Schema.Types.ObjectId, ref: "DeductionRun" },
      cutoffDate: Date,
    },
    // This loan's line on the latest posted payroll run, for the "Missed deduction" flag.
    lastDeduction: {
      run: { type: mongoose.Schema.Types.ObjectId, ref: "DeductionRun" },
      cutoffDate: Date,
      result: { type: String, enum: ["full", "partial", "missed"] },
      reason: String,
      reasonNote: String,
    },
  },
  { timestamps: true },
);

// Named so it doesn't clash with the old required "application_1" index, which db.js drops.
loanSchema.index({ application: 1 }, { name: "application_unique", unique: true, partialFilterExpression: { application: { $type: "objectId" } } });

module.exports = mongoose.model("Loan", loanSchema);
module.exports.LOAN_STATUSES = LOAN_STATUSES;
