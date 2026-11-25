import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { FilePlus2, HandCoins, Handshake, House, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import type { Loan } from '../lib/loans'

type Tab = { to: string; label: string; icon: LucideIcon; end?: boolean; dot?: 'loans' | 'coMaker' }

// Loans · Apply · ( Home ) · Co-maker · Profile, with Home raised in the middle.
const LEFT: Tab[] = [
  { to: '/loans', label: 'Assistance', icon: HandCoins, end: true, dot: 'loans' },
  { to: '/loans/apply', label: 'Apply', icon: FilePlus2 },
]
const RIGHT: Tab[] = [
  { to: '/co-maker', label: 'Co-maker', icon: Handshake, dot: 'coMaker' },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

/** Red dots: a loan past due, and co-maker requests waiting or alerts. Checked again on each page change. */
function useDots(pathname: string) {
  const [dots, setDots] = useState({ loans: false, coMaker: false })
  useEffect(() => {
    let live = true
    Promise.all([
      api<{ loans: Loan[] }>('/api/loans').then((d) => d.loans.some((l) => l.status === 'active' && l.pastDue)).catch(() => false),
      api<{ requests: { status: string; myStatus: string }[]; alerts: unknown[] }>('/api/comaker')
        .then((d) => d.alerts.length > 0 || d.requests.some((r) => r.status === 'pending' && r.myStatus === 'pending'))
        .catch(() => false),
    ]).then(([loans, coMaker]) => live && setDots({ loans, coMaker }))
    return () => {
      live = false
    }
  }, [pathname])
  return dots
}

/**
 * The member's bottom tab bar on phones and tablets (below lg). Staff never see it. Fixed to the
 * bottom with safe-area padding; AppLayout pads <main> so it never covers content.
 */
export default function MemberTabBar() {
  const { pathname } = useLocation()
  const dots = useDots(pathname)

  const item = ({ to, label, icon: Icon, end, dot }: Tab) => (
    <NavLink key={to} to={to} end={end}
      className={({ isActive }) => `relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition ${isActive ? 'font-bold text-accent-dark' : 'font-medium text-brand-600 hover:text-brand-800'}`}>
      <span className="relative">
        <Icon className="h-5 w-5" />
        {dot && dots[dot] && <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-label={dot === 'loans' ? 'A payment is past due' : 'Co-maker requests or alerts'} />}
      </span>
      {label}
    </NavLink>
  )

  return (
    <nav aria-label="Member" className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(11,66,42,0.08)] backdrop-blur lg:hidden print:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch">
        {LEFT.map(item)}
        {/* Home: a raised round button in the middle. */}
        <NavLink to="/home" className="group relative flex flex-1 flex-col items-center justify-end pb-2 text-[11px]">
          {({ isActive }) => (
            <>
              <span className={`absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-800 bg-grad-brand text-white shadow-lg ring-4 ring-white transition group-hover:brightness-110 ${isActive ? 'ring-accent/40' : ''}`}>
                <House className="h-6 w-6" />
              </span>
              <span className={isActive ? 'font-bold text-accent-dark' : 'font-medium text-brand-600'}>Home</span>
            </>
          )}
        </NavLink>
        {RIGHT.map(item)}
      </div>
    </nav>
  )
}
