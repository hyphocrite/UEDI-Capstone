const mongoose = require("mongoose");

// Payments and releases from UDEI's spreadsheet ledger, from before this system. Read only:
// they feed the Reports page and members' history. Amounts are integer centavos.
// memberId is empty for ledger blocks labelled with a name instead of a member number.
const ledgerHistorySchema = new mongoose.Schema({
  source: { type: String, required: true, index: true }, // e.g. "udei-loans-2026.xlsx"
  memberId: { type: String, index: true },
  kind: { type: String, enum: ["payment", "release"], required: true },
  date: { type: Date, required: true, index: true },
  amount: { type: Number, required: true, validate: Number.isInteger },
  serviceFee: { type: Number, default: 0, validate: Number.isInteger },
  reference: { type: String, trim: true, maxlength: 80 },
});

module.exports = mongoose.model("LedgerHistory", ledgerHistorySchema);
