const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const Meeting = require("../models/Meeting");
const { MEETING_KINDS } = require("../models/Meeting");
const Member = require("../models/Member");
const ledger = require("../services/ledger");
const { auditNote } = require("../middleware/audit");
const { requireStaff, requireLevel } = require("../middleware/auth");

// Member meetings and PMES sessions with their attendance, recorded by Loan Officers and up.
const router = express.Router();
router.use(requireStaff, requireLevel("loan_officer"));

const createSchema = z.object({
  title: z.string().trim().min(3, "Enter a title, e.g. 2026 General Assembly.").max(120),
  kind: z.enum(MEETING_KINDS, { message: "Choose the kind of meeting." }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the meeting date."),
});
const attendanceSchema = z.object({
  attendees: z.array(z.string().trim().min(1).max(32)).max(5000),
});

const view = (m) => ({ ...m.toJSON(), attendeeCount: m.attendees.length });

router.get("/", async (_req, res, next) => {
  try {
    const meetings = await Meeting.find().sort({ date: -1 }).limit(100);
    res.json({ meetings: meetings.map(view) });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const date = ledger.calendarDay(parsed.data.date);
    if (date > ledger.todayInManila()) return res.status(400).json({ error: "Record a meeting on or after the day it happens." });
    const meeting = await Meeting.create({ ...parsed.data, date, recordedByName: req.user.fullName });
    auditNote(res, { target: `${meeting.title} (${parsed.data.date})` });
    res.status(201).json({ meeting: view(meeting) });
  } catch (err) {
    next(err);
  }
});

// Replaces the attendance list (the page sends everyone who is ticked).
router.put("/:id/attendance", async (req, res, next) => {
  try {
    const parsed = attendanceSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Meeting not found." });
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const attendees = [...new Set(parsed.data.attendees)];
    const known = await Member.countDocuments({ memberId: { $in: attendees } });
    if (known !== attendees.length) return res.status(400).json({ error: "Some of those member numbers are not on file." });
    auditNote(res, {
      target: `${meeting.title} (${meeting.date.toISOString().slice(0, 10)})`,
      before: { attendees: meeting.attendees.length },
      details: { attendees: attendees.length, added: attendees.filter((a) => !meeting.attendees.includes(a)), removed: meeting.attendees.filter((a) => !attendees.includes(a)) },
    });
    meeting.attendees = attendees;
    await meeting.save();
    res.json({ meeting: view(meeting) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
