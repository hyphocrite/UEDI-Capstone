import type { Role } from './roles'

// Sign-in accounts as GET /api/auth/users lists them.
// newMemberId: only their own new ID (N-…) from sign-up, so not linked to a UDEI number yet.
// memberNo: the number a phone-app member typed when signing up, a hint for linking.
export type Account = { id: string; fullName: string; email: string; role: Role; memberId: string | null; memberNo?: string | null; newMemberId?: boolean; createdAt?: string }

export const isLinked = (a: Account) => !!a.memberId && !a.newMemberId
/** Member-level accounts not linked to a UDEI number yet. */
export const waitingToLink = (a: Account) => !isLinked(a) && (a.role === 'staff' || (a.role as string) === 'member')
