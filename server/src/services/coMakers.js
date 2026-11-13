// Co-makers: members who vouch for a loan. Named on the application, they confirm in their
// co-maker portal before the four signers can sign, and they are told by email when they are
// named and when the borrower misses a payroll deduction.

const User = require("../models/User");
const Member = require("../models/Member");
const Application = require("../models/Application");
const Loan = require("../models/Loan");
const mailer = require("./mailer");

class CoMakerError extends Error {}

/**
 * Checks the co-makers named on an application and returns them as stored entries. Each must be a
 * UDEI member with a linked account (so they can confirm), not the applicant, and named once.
 */
async function resolve(memberIds, applicantMemberId, required) {
  const ids = [...new Set((memberIds || []).map((s) => String(s).trim()).filter(Boolean))];
  if (ids.length !== (memberIds || []).filter((s) => String(s).trim()).length) throw new CoMakerError("Name each co-maker once.");
  if (ids.length < required) throw new CoMakerError(required === 1 ? "Name a co-maker: a UDEI member who vouches for this loan." : `Name ${required} co-makers: UDEI members who vouch for this loan.`);
  if (ids.length > 2) throw new CoMakerError("Name at most 2 co-makers.");
  if (applicantMemberId && ids.includes(applicantMemberId)) throw new CoMakerError("The applicant can't be their own co-maker.");
  const [members, users] = await Promise.all([Member.find({ memberId: { $in: ids } }), User.find({ memberId: { $in: ids } })]);
  return ids.map((id) => {
    const member = members.find((m) => m.memberId === id);
    const user = users.find((u) => u.memberId === id);
    if (!member) throw new CoMakerError(`No UDEI member with number ${id}.`);
    if (!user) throw new CoMakerError(`Member ${id} (${member.fullName}) has no account yet, so they can't confirm. Ask them to sign up and have the office link it.`);
    return { memberId: id, name: member.fullName, user: user._id, status: "pending" };
  });
}

/** Who still has to confirm, as a sentence for the signers; null when all have accepted. */
function blocking(app) {
  const pending = (app.coMakers || []).filter((c) => c.status !== "accepted");
  if (!pending.length) return null;
  const declined = pending.filter((c) => c.status === "declined");
  if (declined.length) return `Co-maker ${declined.map((c) => c.name).join(" and ")} declined. Deny the application, or the applicant files again with another co-maker.`;
  return `Waiting for co-maker ${pending.map((c) => c.name).join(" and ")} to confirm in their co-maker portal.`;
}

const peso = (n) => `PHP ${Number(n).toLocaleString("en-PH")}`;

async function emailUsers(userIds, subject, text) {
  const users = await User.find({ _id: { $in: userIds } }).select("email fullName");
  await Promise.all(users.map((u) => mailer.send({ to: u.email, subject, text: `Hello ${u.fullName},\n\n${text}\n\nUDEI Loans`, html: `<p>Hello ${u.fullName},</p><p>${text.replace(/\n/g, "<br>")}</p><p>UDEI Loans</p>` }).catch((err) => console.error("Co-maker email failed:", err.message))));
}

/** Tells each co-maker they were named and must confirm. Best effort: a failed email doesn't stop filing. */
function notifyNamed(app) {
  return emailUsers(
    app.coMakers.map((c) => c.user),
    `You were named co-maker for ${app.applicant.fullName}`,
    `${app.applicant.fullName} named you as co-maker on loan application ${app.applicationNo} for ${peso(app.loan.amount)} over ${app.loan.termMonths} months.\nSign in and open "Co-maker" to accept or decline. The application can't be signed until you answer.`,
  );
}

/** After a payroll run: tells the co-makers of each loan that had a missed or partial deduction. */
async function notifyMissed(lines) {
  const missed = lines.filter((l) => ["missed", "partial"].includes(l.result));
  if (!missed.length) return;
  const loanDocs = await Loan.find({ _id: { $in: missed.map((l) => l.loan) } }).select("application loanNo borrowerName");
  const apps = await Application.find({ _id: { $in: loanDocs.map((l) => l.application).filter(Boolean) } }).select("coMakers");
  for (const loan of loanDocs) {
    const app = apps.find((a) => loan.application && a._id.equals(loan.application));
    const backers = (app?.coMakers || []).filter((c) => c.status === "accepted").map((c) => c.user);
    if (!backers.length) continue;
    const line = missed.find((l) => String(l.loan) === String(loan._id));
    await emailUsers(
      backers,
      `${loan.borrowerName} missed a loan payment`,
      `The payroll deduction for loan ${loan.loanNo} of ${loan.borrowerName}, which you vouched for as co-maker, was ${line.result === "partial" ? "only partly" : "not"} made this cutoff.\nSign in and open "Co-maker" to see the loan's status.`,
    );
  }
}

module.exports = { CoMakerError, resolve, blocking, notifyNamed, notifyMissed };
