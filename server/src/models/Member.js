const mongoose = require("mongoose");
const { EMPLOYMENT_STATUSES } = require("./Application");

// A UDEI member: the record that loans, applications, retirement plans and (through
// User.memberId) app accounts point to by memberId, which is the UDEI member number.
// Members are never deleted; someone who leaves is set to inactive.
const MEMBER_STATUSES = ["active", "inactive"];

const centavos = { type: Number, validate: Number.isInteger };

const memberSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, unique: true, trim: true, maxlength: 32 },
    // UDEI's spreadsheets list members by number only, so names are filled in later by staff.
    lastName: { type: String, trim: true, maxlength: 60 },
    firstName: { type: String, trim: true, maxlength: 60 },
    middleInitial: { type: String, trim: true, maxlength: 3 },
    // "First M. Last", or "Member No. 12" until a name is entered. Kept for search and display.
    fullName: { type: String, trim: true, maxlength: 140 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    branch: { type: String, trim: true, maxlength: 120 },
    residenceAddress: { type: String, trim: true, maxlength: 300 },
    employer: { type: String, trim: true, maxlength: 120 },
    employmentStatus: { type: String, enum: EMPLOYMENT_STATUSES },
    dateOfBirth: Date,
    joinedAt: Date,
    status: { type: String, enum: MEMBER_STATUSES, default: "active", index: true },
    // Made at sign-up with a new "N-" ID; merged into the real member when the office links the account.
    provisional: { type: Boolean, default: false },
    // UDEI's own remark, e.g. "On Amnesty", "Separated", "In-Active - Transferred".
    remarks: { type: String, trim: true, maxlength: 120 },
    // Mutual Assistance balance carried over from UDEI's spreadsheet ledger (before this system),
    // in centavos. Loans made in the system are in the Loan collection instead.
    openingLoan: {
      type: new mongoose.Schema(
        {
          asOf: Date,
          balanceStartOfYear: centavos, // as of December 31 of the previous year
          appliedThisYear: centavos,
          payments: centavos,
          interest: centavos,
          balance: centavos,
          loansThisYear: { type: Number, default: 0 },
        },
        { _id: false },
      ),
    },
    createdByName: String,
    updatedByName: String,
  },
  { timestamps: true },
);

memberSchema.pre("save", function setFullName() {
  const mi = this.middleInitial ? ` ${this.middleInitial.replace(/\.$/, "")}.` : "";
  const name = [this.firstName, this.lastName].filter(Boolean).length
    ? `${this.firstName || ""}${mi} ${this.lastName || ""}`.trim()
    : `Member No. ${this.memberId}`;
  this.fullName = name;
});

module.exports = mongoose.model("Member", memberSchema);
module.exports.MEMBER_STATUSES = MEMBER_STATUSES;
