import type { Application, Loan } from '../api'

export function applicationBadge(a: Application) {
  if (a.status === 'approved') return { text: 'Approved', tone: 'green' as const }
  if (a.status === 'denied') return { text: 'Denied', tone: 'red' as const }
  return { text: 'In review', tone: 'amber' as const }
}

export function loanBadge(l: Loan) {
  if (l.status === 'paid') return { text: 'Fully paid', tone: 'gray' as const }
  if (l.status === 'for_release') return { text: 'For release', tone: 'amber' as const }
  if (l.pastDue) return { text: 'Past due', tone: 'red' as const }
  return { text: 'Active', tone: 'green' as const }
}

export const SIGNERS = ['Bookkeeper', 'Treasurer', 'Credit Committee Chairman', 'President']
