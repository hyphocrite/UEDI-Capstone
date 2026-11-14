// Every new sign-in account gets its own member record and ID at sign-up ("N-0001", "N-0002", …),
// so a new member can apply, be scored and be a co-maker straight away. When the office later links
// the account to the member's real UDEI number, everything filed under the new ID moves to that
// member (merge) and the new ID's record is removed.

const Member = require("../models/Member");
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const BillRecord = require("../models/BillRecord");
const Meeting = require("../models/Meeting");
const DeductionRun = require("../models/DeductionRun");
const LedgerHistory = require("../models/LedgerHistory");
const RetirementPlan = require("../models/RetirementPlan");

const PREFIX = "N-";
const isNewId = (id) => typeof id === "string" && id.startsWith(PREFIX);

async function nextId() {
  const [last] = await Member.find({ memberId: { $regex: /^N-\d+$/ } }).select("memberId").lean()
    .then((list) => list.map((m) => Number(m.memberId.slice(PREFIX.length))).sort((a, b) => b - a));
  return `${PREFIX}${String((last || 0) + 1).padStart(4, "0")}`;
}

/** Splits "Maria C. Santos" into first name, middle initial and last name, as best it can. */
function splitName(fullName = "") {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] };
  const lastName = words.pop();
  const mi = words.length > 1 && /^[A-Za-z]\.?$/.test(words[words.length - 1]) ? words.pop().replace(/\.$/, "") : undefined;
  return { firstName: words.join(" "), middleInitial: mi, lastName };
}

/** Gives the account its own new member record if it has none. Saves the user. Returns the ID. */
async function ensureFor(user) {
  if (user.memberId) return user.memberId;
  for (let attempt = 0; attempt < 5; attempt++) {
    const memberId = await nextId();
    try {
      await Member.create({
        memberId,
        provisional: true,
        ...splitName(user.fullName),
        email: user.email,
        phone: user.phone,
        branch: user.branch,
        joinedAt: new Date(),
        createdByName: "Self sign-up",
      });
    } catch (err) {
      if (err?.code === 11000) continue; // someone else took that number at the same moment
      throw err;
    }
    user.memberId = memberId;
    await user.save();
    return memberId;
  }
  throw new Error("Could not assign a member ID. Try again.");
}

const FILLABLE = ["firstName", "middleInitial", "lastName", "phone", "email", "branch", "residenceAddress", "employer", "employmentStatus", "dateOfBirth"];

/**
 * Moves everything filed under the new ID `fromId` to member `toId`. If no member `toId` exists yet,
 * the new record simply takes that number. Returns how many records moved, for the audit log.
 */
async function merge(fromId, toId, byName) {
  if (!isNewId(fromId) || fromId === toId) return null;
  const from = await Member.findOne({ memberId: fromId });
  const to = await Member.findOne({ memberId: toId });
  const set = (field) => ({ $set: { [field]: toId } });

  const moved = {
    applications: (await Application.updateMany({ "applicant.memberId": fromId }, set("applicant.memberId"))).modifiedCount,
    coMakerEntries: (await Application.updateMany(
      { "coMakers.memberId": fromId },
      { $set: { "coMakers.$[c].memberId": toId } },
      { arrayFilters: [{ "c.memberId": fromId }] },
    )).modifiedCount,
    loans: (await Loan.updateMany({ memberId: fromId }, set("memberId"))).modifiedCount,
    bills: (await BillRecord.updateMany({ memberId: fromId }, set("memberId"))).modifiedCount,
    meetings: (await Meeting.updateMany(
      { attendees: fromId },
      { $set: { "attendees.$[a]": toId } },
      { arrayFilters: [{ a: fromId }] },
    )).modifiedCount,
    deductionLines: (await DeductionRun.updateMany(
      { "lines.memberId": fromId },
      { $set: { "lines.$[l].memberId": toId } },
      { arrayFilters: [{ "l.memberId": fromId }] },
    )).modifiedCount,
    ledger: (await LedgerHistory.updateMany({ memberId: fromId }, set("memberId"))).modifiedCount,
    retirementPlan: 0,
  };
  // One retirement plan per member: move the new one only if the real member has none.
  if (!(await RetirementPlan.exists({ memberId: toId }))) {
    moved.retirementPlan = (await RetirementPlan.updateMany({ memberId: fromId }, set("memberId"))).modifiedCount;
  }

  if (from) {
    if (to) {
      // Fill in what the office's record is missing from what the member gave at sign-up.
      for (const f of FILLABLE) if (!to[f] && from[f]) to[f] = from[f];
      to.updatedByName = byName;
      await to.save();
      await Member.deleteOne({ _id: from._id });
    } else {
      from.memberId = toId;
      from.provisional = false;
      from.updatedByName = byName;
      await from.save();
    }
  }
  return moved;
}

module.exports = { ensureFor, merge, isNewId, splitName, PREFIX };
