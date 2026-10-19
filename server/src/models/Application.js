const mongoose = require("mongoose");

// Fields follow UEDI's Mutual Assistance Application Form.
const LOAN_TYPES = ["long_term", "emergency"];
const EMPLOYMENT_STATUSES = ["permanent", "temporary", "contractual", "job_order"];
const PAYMENT_FREQUENCIES = ["quincenal", "monthly"];
const STATUSES = ["pending", "approved", "denied"];
const SUGGESTIONS = ["approve", "review", "deny"];

const documentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, maxlength: 255 },
    type: { type: String, maxlength: 64 },
    verdict: { type: String, enum: ["verified", "review", "mismatch", "unreadable"] },
    sha256: { type: String, maxlength: 64 },
    notes: [{ type: String, maxlength: 300 }],
  },
  { _id: false },
);

const factorSchema = new mongoose.Schema(
  { feature: String, label: String, value: Number, impact: Number, direction: String },
  { _id: false },
);

const modelScoreSchema = new mongoose.Schema(
  {
    key: String,
    name: String,
    defaultProbability: Number,
    suggestion: { type: String, enum: SUGGESTIONS },
    topFactors: [factorSchema],
    cvMetrics: mongoose.Schema.Types.Mixed,
  },
  { _id: false },
);

const assessmentSchema = new mongoose.Schema(
  {
    ensemble: {
      name: String,
      defaultProbability: Number,
      suggestion: { type: String, enum: SUGGESTIONS },
      modelWeights: mongoose.Schema.Types.Mixed,
      cvMetrics: mongoose.Schema.Types.Mixed,
    },
    models: [modelScoreSchema],
    thresholds: { approve: Number, deny: Number },
    modelVersion: String,
    assessedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    applicationNo: { type: String, required: true, unique: true },
    applicant: {
      lastName: { type: String, required: true, trim: true, maxlength: 60 },
      firstName: { type: String, required: true, trim: true, maxlength: 60 },
      middleInitial: { type: String, trim: true, maxlength: 3 },
      // "First M. Last", kept for lists and search.
      fullName: { type: String, required: true, trim: true, maxlength: 130 },
      memberId: { type: String, maxlength: 32 },
      residenceAddress: { type: String, required: true, trim: true, maxlength: 300 },
      employer: { type: String, required: true, trim: true, maxlength: 120 },
      employmentStatus: { type: String, enum: EMPLOYMENT_STATUSES, default: "permanent" },
      monthlySalary: { type: Number, required: true, min: 0 },
      netTakeHomePay: { type: Number, required: true, min: 0 },
      dateOfBirth: { type: Date },
      yearsAsMember: { type: Number, default: 0, min: 0 },
      priorLoans: { type: Number, default: 0, min: 0 },
      priorLatePayments: { type: Number, default: 0, min: 0 },
    },
    loan: {
      loanType: { type: String, enum: LOAN_TYPES, required: true },
      amount: { type: Number, required: true, min: 1 },
      termMonths: { type: Number, required: true, min: 1 },
      // Percent per month, as written on the form.
      monthlyRate: { type: Number, required: true, min: 0 },
      paymentFrequency: { type: String, enum: PAYMENT_FREQUENCIES, default: "monthly" },
      purpose: { type: String, maxlength: 300 },
    },
    // The "To be filled up by the Bookkeeper" part of the form.
    bookkeeper: {
      longTermBalance: { type: Number, default: 0, min: 0 },
      longTermDueDate: Date,
      shortTermBalance: { type: Number, default: 0, min: 0 },
      shortTermDueDate: Date,
    },
    agreement: {
      payrollDeduction: { type: Boolean, required: true },
      autoRestructure: { type: Boolean, required: true },
      applicationDate: { type: Date, required: true },
    },
    documents: [documentSchema],
    status: { type: String, enum: STATUSES, default: "pending", index: true },
    assessment: assessmentSchema,
    assessmentError: String,
    decision: {
      decision: { type: String, enum: ["approved", "denied"] },
      note: { type: String, maxlength: 1000 },
      followedSuggestion: Boolean,
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      decidedByName: String,
      decidedAt: Date,
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    submittedByName: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Application", applicationSchema);
module.exports.LOAN_TYPES = LOAN_TYPES;
module.exports.EMPLOYMENT_STATUSES = EMPLOYMENT_STATUSES;
module.exports.PAYMENT_FREQUENCIES = PAYMENT_FREQUENCIES;
