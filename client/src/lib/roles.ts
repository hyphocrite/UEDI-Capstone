// User roles and the approval chain. Mirrors server/src/models/User.js and server/src/services/approvals.js.

export const ROLES = ['admin', 'loan_officer', 'bookkeeper', 'treasurer', 'crecom_chair', 'president', 'staff'] as const
export type Role = (typeof ROLES)[number]

export const roleLabel: Record<Role, string> = {
  admin: 'Administrator',
  loan_officer: 'Loan Officer',
  bookkeeper: 'Bookkeeper',
  treasurer: 'Treasurer',
  crecom_chair: 'Credit Committee Chairman',
  president: 'President',
  staff: 'Staff',
}

/** The four signatures on the Mutual Assistance form, in order. Each is signed by the role of the same name. */
export const APPROVAL_STEPS = ['bookkeeper', 'treasurer', 'crecom_chair', 'president'] as const
export type ApprovalStep = (typeof APPROVAL_STEPS)[number]

/** Short labels for the step tracker. */
export const stepShortLabel: Record<ApprovalStep, string> = {
  bookkeeper: 'Bookkeeper',
  treasurer: 'Treasurer',
  crecom_chair: 'CreCom Chairman',
  president: 'President',
}

export const isSigner = (role: Role | undefined): role is ApprovalStep =>
  !!role && (APPROVAL_STEPS as readonly string[]).includes(role)
