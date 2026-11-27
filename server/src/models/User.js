const mongoose = require("mongoose");

// loan_officer takes in applications; the four signer roles sign the approval chain
// (see services/approvals.js); admin manages users but does not sign.
// staff (shown as "Member") is a member's own account, made by signing up on the web or in the app:
// it sees only its own applications and loans. "member" is the same, kept for older mobile sign-ups
// until scripts/migrate-signup-roles.js changes them to staff.
const ROLES = ["admin", "loan_officer", "bookkeeper", "treasurer", "crecom_chair", "president", "staff", "member"];

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "staff" },
    branch: { type: String, trim: true, maxlength: 120 },
    // The member record this account belongs to, set by a Loan Officer or Administrator.
    // A member sees the loans and applications filed under this ID.
    memberId: { type: String, trim: true, maxlength: 32 },
    // Mobile app members only.
    memberNo: { type: String, trim: true, maxlength: 32 },
    phone: { type: String, trim: true, maxlength: 20 },
    lastLoginAt: { type: Date },
    // Agreement to the Privacy Notice (config/privacy.js): which version, when, from which IP.
    privacyConsent: { type: new mongoose.Schema({ version: String, at: Date, ip: String }, { _id: false }), default: undefined },
    // Sessions started before this (a password change) no longer work.
    sessionsValidAfter: { type: Date },
    // false until the emailed code is entered. Accounts made before verification existed have no
    // value and are treated as verified.
    emailVerified: { type: Boolean },
    emailVerification: {
      type: new mongoose.Schema(
        { codeHash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, sentAt: Date },
        { _id: false },
      ),
      select: false,
    },
    // Forgot password: the emailed reset code, same shape as emailVerification.
    passwordReset: {
      type: new mongoose.Schema(
        { codeHash: String, expiresAt: Date, attempts: { type: Number, default: 0 }, sentAt: Date },
        { _id: false },
      ),
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.methods.toSession = function toSession() {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    // Older mobile sign-ups ("member") are shown as the one member role.
    role: this.role === "member" ? "staff" : this.role,
    branch: this.branch || null,
    memberId: this.memberId || null,
    memberNo: this.memberNo || null,
    // Accounts that haven't agreed to the current Privacy Notice are asked once after sign-in.
    needsConsent: this.privacyConsent?.version !== require("../config/privacy").PRIVACY_NOTICE_VERSION,
  };
};

// One account per member record, so nobody else can see that member's loans.
userSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { memberId: { $type: "string" } } });

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
