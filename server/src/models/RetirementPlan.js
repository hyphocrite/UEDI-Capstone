const mongoose = require("mongoose");

// A member's retirement plan, as UDEI keeps it: a balance that grows with a monthly
// contribution. Part of each contribution goes to the plan ("Ret. Plan") and the rest is
// the member's monthly dues. Amounts are integer centavos. Contributions are never deleted;
// a mistake is voided with a reason.
const centavos = { type: Number, required: true, validate: Number.isInteger };

const contributionSchema = new mongoose.Schema({
  month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // the month it covers
  amount: { ...centavos, min: 0 }, // to the retirement plan
  dues: { ...centavos, min: 0, default: 0 }, // monthly dues
  paidAt: { type: Date, required: true },
  method: { type: String, enum: ["payroll", "cash", "other"], required: true },
  reference: { type: String, trim: true, maxlength: 60 },
  source: { type: String, enum: ["manual", "import"], default: "manual" },
  recordedByName: String,
  voided: { type: Boolean, default: false },
  voidReason: { type: String, trim: true, maxlength: 300 },
  voidedByName: String,
  voidedAt: Date,
});

const retirementPlanSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, unique: true },
    memberName: { type: String, required: true },
    // Contributions are expected every month from this date (UDEI uses the date of membership).
    startDate: { type: Date, required: true },
    monthlyContribution: { ...centavos, min: 0 }, // plan share + dues; 0 when no amount is set
    planShare: { ...centavos, min: 0 }, // the part that goes to the plan
    // The plan balance carried over from before the first contribution recorded here.
    openingBalance: { ...centavos, min: 0, default: 0 },
    openingAsOf: Date,
    contributions: [contributionSchema],
    createdByName: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("RetirementPlan", retirementPlanSchema);
