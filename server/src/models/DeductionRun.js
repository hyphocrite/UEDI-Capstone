const mongoose = require("mongoose");
const { REASONS } = require("../services/deductions");

// One payroll deduction run per cutoff (the 15th or the month-end): the list sent to DNSC's
// Payroll Officer, then what payroll actually remitted. Amounts are integer centavos.
const RUN_STATUSES = ["draft", "sent", "posted"];
const RESULTS = ["full", "partial", "missed"];

const int = { type: Number, validate: Number.isInteger };

const lineSchema = new mongoose.Schema({
  loan: { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true },
  loanNo: { type: String, required: true },
  memberId: String,
  borrowerName: { type: String, required: true },
  loanType: String,
  expected: { ...int, required: true, min: 0 },
  arrears: { ...int, default: 0, min: 0 },
  remitted: { ...int, min: 0 },
  result: { type: String, enum: RESULTS },
  reason: { type: String, enum: REASONS },
  reasonNote: { type: String, trim: true, maxlength: 300 },
  // Taken off the list while the run was a draft.
  removed: { type: Boolean, default: false },
  removedReason: { type: String, trim: true, maxlength: 300 },
});

const runSchema = new mongoose.Schema(
  {
    cutoffDate: { type: Date, required: true, unique: true },
    status: { type: String, enum: RUN_STATUSES, default: "draft", index: true },
    lines: [lineSchema],
    remittance: {
      officialReceiptNo: { type: String, trim: true, maxlength: 40 },
      amountReceived: { ...int, min: 0 },
      receivedAt: Date,
    },
    // Set while posting so two posts can't run at once.
    posting: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdByName: String,
    sentAt: Date,
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sentByName: String,
    postedAt: Date,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    postedByName: String,
    unposts: [
      new mongoose.Schema(
        { reason: String, by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, byName: String, at: Date },
        { _id: false },
      ),
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("DeductionRun", runSchema);
module.exports.RUN_STATUSES = RUN_STATUSES;
