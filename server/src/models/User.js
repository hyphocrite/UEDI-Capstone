const mongoose = require("mongoose");

const ROLES = ["admin", "loan_officer", "staff"];

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
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.methods.toSession = function toSession() {
  return {
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    branch: this.branch || null,
  };
};

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
