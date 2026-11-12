// Who may see what. Each level includes everything below it:
//   Member (staff) < Loan Officer, Bookkeeper < Treasurer < CreCom Chairman, President < Administrator.
// Mirrored in client/src/lib/roles.ts.
const LEVEL = {
  staff: 0,
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

module.exports = { LEVEL, atLeast, seesAllLoans };
