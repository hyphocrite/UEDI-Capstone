const mongoose = require("mongoose");

// A member meeting or a Pre-Membership Education Seminar (PMES), with who attended. Staff
// record these on the Attendance page; attendance feeds the member score and early warning.
const KINDS = ["general_assembly", "pmes", "other"];

const meetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: KINDS, default: "general_assembly" },
    date: { type: Date, required: true, index: true },
    // Member IDs of those who attended.
    attendees: { type: [String], default: [] },
    recordedByName: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Meeting", meetingSchema);
module.exports.MEETING_KINDS = KINDS;
