const mongoose = require("mongoose");

// A utility or mobile-load bill a member showed proof of, and whether it was paid on time.
// Alternative data for members with little loan history. Never deleted; mistakes are voided.
const KINDS = ["electricity", "water", "internet", "mobile_load", "other"];
const STATUSES = ["on_time", "late", "unpaid"];

const billRecordSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, index: true },
    kind: { type: String, enum: KINDS, required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // the billing month
    status: { type: String, enum: STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 200 },
    recordedByName: String,
    voided: { type: Boolean, default: false },
    voidReason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BillRecord", billRecordSchema);
module.exports.BILL_KINDS = KINDS;
module.exports.BILL_STATUSES = STATUSES;
