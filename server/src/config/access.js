// Who may see what. Each level includes everything below it:
//   Member (staff) < Loan Officer, Bookkeeper < Treasurer < CreCom Chairman, President < Administrator.
// Mirrored in client/src/lib/roles.ts.
const LEVEL = {
  staff: 0,
  // Older mobile sign-ups. The same as staff (the Member role); scripts/migrate-signup-roles.js turns them into staff.
  member: 0,
  loan_officer: 1,
  bookkeeper: 1,
  treasurer: 2,
  crecom_chair: 3,
  president: 3,
  admin: 4,
};

/** True when `role` sits at or above `minRole` on the ladder. */
const atLeast = (role, minRole) => (LEVEL[role] ?? -1) >= LEVEL[minRole];

/** Members only see their own loans and applications; everyone from Loan Officer up sees all of them. */
const seesAllLoans = (user) => atLeast(user.role, "loan_officer");

/**
 * A member's own account (role "staff", shown as Member; "member" for older mobile sign-ups): it
 * sees only its own records. Web and mobile sign-ups make the same kind of account.
 */
const isMemberAccount = (user) => user?.role === "staff" || user?.role === "member";

module.exports = { LEVEL, atLeast, seesAllLoans, isMemberAccount };
