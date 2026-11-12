const mongoose = require("mongoose");

// One entry per request that changes something (see middleware/audit.js), whether it succeeded or
// not. Entries are only ever added: nothing in the API edits or deletes them, and only
// administrators can read them.
const auditLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  // Who: the signed-in account, or for sign-in and sign-up the email that was typed.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  userName: String,
  userEmail: String,
  role: String,
  // What: a readable action, e.g. "Application approved", and the record it was about.
  action: { type: String, required: true, index: true },
  target: String,
  method: String,
  path: String,
  // What was sent (passwords and codes removed), and for some actions the values before the change.
  details: mongoose.Schema.Types.Mixed,
  before: mongoose.Schema.Types.Mixed,
  // Outcome
  status: Number,
  ok: { type: Boolean, index: true },
  error: String,
  ip: String,
  client: String, // "web" or "mobile"
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
