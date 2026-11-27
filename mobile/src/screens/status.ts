import type { Application, Loan } from '../api'

/** An application's status in the member's words (the app is for members): same as the web's memberStatusText. */
export const MEMBER_STATUS_TEXT = { pending: 'Pending', approved: 'Approved', denied: 'Not approved' } as const

export function applicationBadge(a: Application) {
  if (a.status === 'approved') return { text: MEMBER_STATUS_TEXT.approved, tone: 'green' as const }
  if (a.status === 'denied') return { text: MEMBER_STATUS_TEXT.denied, tone: 'red' as const }
  return { text: MEMBER_STATUS_TEXT.pending, tone: 'amber' as const }
}

export function loanBadge(l: Loan) {
  if (l.status === 'paid') return { text: 'Fully paid', tone: 'green' as const }
  if (l.status === 'for_release') return { text: 'For release', tone: 'amber' as const }
  if (l.pastDue) return { text: 'Past due', tone: 'red' as const }
  return { text: 'Active', tone: 'green' as const }
}

// In signing order: the Treasurer signs last, then releases the money.
export const SIGNERS = ['Bookkeeper', 'Credit Committee Chairman', 'President', 'Treasurer']
