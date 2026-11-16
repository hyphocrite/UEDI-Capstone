const Loan = require("../models/Loan");
const loans = require("./loans");
const ledger = require("./ledger");

// A member's loan history, for the loan form's "History with UDEI" fields and the member score.
// Used by routes/members.js (staff) and routes/me.js (the member's own score).

/**
 * What the loan form's "History with UDEI" fields need: loans in the system plus those in UDEI's
 * spreadsheet ledger (the carried-over balance counts as one loan, and so does each 2026 release).
 * A member "On Amnesty" had fallen behind, so that counts as a late loan.
 */
async function historyOf(member) {
  return (await historiesFor([member])).get(member.memberId);
}

/** historyOf() for many members with one query, for the members list. */
async function historiesFor(members) {
  // A ledger loan is the carried-over balance, already counted below as a spreadsheet loan.
  const all = await Loan.find({ memberId: { $in: members.map((m) => m.memberId) }, status: { $in: ["active", "paid"] }, source: { $ne: "ledger" } });
  return new Map(members.map((m) => [m.memberId, historyFrom(m, all.filter((l) => l.memberId === m.memberId))]));
}

function historyFrom(member, released) {
  const lateInSystem = released.filter((l) => loans.present(l).pastDue || ["missed", "partial"].includes(l.lastDeduction?.result));
  const opening = member.openingLoan || {};
  const spreadsheetLoans = (opening.balanceStartOfYear > 0 ? 1 : 0) + (opening.loansThisYear || 0);
  const priorLoans = released.length + spreadsheetLoans;
  const amnesty = /amnesty/i.test(member.remarks || "") ? 1 : 0;
  const joined = member.joinedAt ? ledger.calendarDay(member.joinedAt).getTime() : null;
  const years = joined == null ? 0 : Math.max(0, Math.floor((ledger.todayInManila().getTime() - joined) / (365.25 * 86_400_000)));
  return {
    yearsAsMember: years,
    priorLoans,
    priorLatePayments: Math.min(priorLoans, lateInSystem.length + amnesty),
    // The spreadsheet balance, for the Bookkeeper section when the member has no loans in the system yet.
    carriedBalance: opening.balance > 0 ? opening.balance : 0,
    carriedAsOf: opening.asOf || null,
  };
}

module.exports = { historyOf, historiesFor };
