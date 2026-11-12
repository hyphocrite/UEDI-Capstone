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
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByName: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Setting", settingSchema);
