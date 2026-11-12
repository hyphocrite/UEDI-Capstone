const mongoose = require("mongoose");

// Session tokens ended before they expire (logout, "stay signed in" swaps). Each entry deletes
// itself when the token would have expired anyway.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model("RevokedToken", revokedTokenSchema);
