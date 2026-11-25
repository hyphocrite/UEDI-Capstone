const mongoose = require("mongoose");

// UDEI's loan rules, kept in one document (key "loan") and edited on the Settings page.
// Read by the loan form, the member app and the server's own checks, so all three agree.
const productSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    monthlyRate: { type: Number, required: true, min: 0, max: 10 }, // % per month, on the remaining balance
    maxTermMonths: { type: Number, required: true, min: 1, max: 120 },
  },
  { _id: false },
);

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    products: {
      long_term: { type: productSchema, required: true },
      emergency: { type: productSchema, required: true },
    },
    // Applications below this monthly salary are refused (panel recommendation: PHP 10,000).
    minMonthlySalary: { type: Number, required: true, min: 0, max: 10_000_000 },
    // Offices or branches shown on sign-up, profiles and member records.
    branches: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    // No longer enforced: members' co-makers are optional, asked for case by case by the signers.
    coMakersRequired: { type: Number, min: 0, max: 2, default: 0 },
    // Pending Loans suggests a co-maker for members' loans of this amount (pesos) or more. 0: never.
    coMakersFromAmount: { type: Number, min: 0, max: 10_000_000, default: 50000 },
    // Applicants not linked to a UDEI member number borrow at most this (pesos) and need a member
    // as co-maker. 0 turns the rule off.
    nonMemberMaxAmount: { type: Number, min: 0, max: 10_000_000, default: 5000 },
    // The remittance list from DNSC Accounting: which sheet and which header is which column, as the
    // Bookkeeper last confirmed it (services/remittanceImport.js), so the next upload fills itself in.
    remittanceImport: {
      sheet: { type: String, trim: true, maxlength: 120 },
      mapping: {
        amount: { type: String, trim: true, maxlength: 120 },
        loanNo: { type: String, trim: true, maxlength: 120 },
        memberNo: { type: String, trim: true, maxlength: 120 },
        employeeNo: { type: String, trim: true, maxlength: 120 },
        name: { type: String, trim: true, maxlength: 120 },
        lastName: { type: String, trim: true, maxlength: 120 },
        firstName: { type: String, trim: true, maxlength: 120 },
      },
      savedByName: String,
      savedAt: Date,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByName: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Setting", settingSchema);
