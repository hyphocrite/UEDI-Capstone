import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, BrainCircuit, CalendarCheck, CalendarDays, ClipboardCheck, FilePlus2, Handshake, HandCoins, History, House, LayoutDashboard, LogOut, Menu, PiggyBank, ReceiptText, Settings, Siren, UserRound, Users, Wallet, X } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import MemberTabBar from '../components/MemberTabBar'
import SessionTimeout from '../components/SessionTimeout'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { awaitingUser } from '../lib/applications'
import type { LoanApplication } from '../lib/applications'
import { atLeast, homePath, PAYMENTS_ROLES, roleLabel } from '../lib/roles'
import type { Role } from '../lib/roles'

type Section = 'Overview' | 'Members' | 'Loans' | 'Records' | 'Admin'

// min: shown to this role and every role above it (see lib/roles.ts). roles: shown only to these roles.
// Must match the route guards in App.tsx. section: the heading it sits under in the sidebar.
const nav: { to: string; label: string; icon: typeof Users; section: Section; end?: boolean; min?: Role; roles?: Role[]; badge?: 'payments' }[] = [
  { to: '/home', label: 'Home', icon: House, section: 'Overview', roles: ['staff'] },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview', min: 'loan_officer' },
  { to: '/members', label: 'Members', icon: Users, section: 'Members', min: 'loan_officer' },
  { to: '/loans', label: 'Loans', icon: HandCoins, section: 'Loans', end: true },
  { to: '/loans/apply', label: 'Apply for a Loan', icon: FilePlus2, section: 'Loans' },
  { to: '/co-maker', label: 'Co-maker', icon: Handshake, section: 'Loans' },
  { to: '/loans/pending', label: 'Pending Loans', icon: ClipboardCheck, section: 'Loans', min: 'loan_officer' },
  { to: '/early-warning', label: 'Early Warning', icon: Siren, section: 'Loans', min: 'loan_officer' },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, section: 'Records', min: 'loan_officer' },
  { to: '/retirement-plans', label: 'Retirement Plans', icon: PiggyBank, section: 'Records', min: 'loan_officer' },
  { to: '/deductions', label: 'Payroll Deductions', icon: ReceiptText, section: 'Records', roles: ['bookkeeper', 'treasurer', 'admin'] },
  { to: '/payments', label: 'Payments', icon: Wallet, section: 'Records', roles: PAYMENTS_ROLES, badge: 'payments' },
  { to: '/reports', label: 'Reports', icon: BarChart3, section: 'Records', min: 'treasurer' },
  { to: '/settings', label: 'Loan Settings', icon: Settings, section: 'Admin', min: 'crecom_chair' },
  { to: '/credit-model', label: 'Credit Model', icon: BrainCircuit, section: 'Admin', min: 'admin' },
  { to: '/audit-log', label: 'Audit Log', icon: History, section: 'Admin', min: 'admin' },
]
const SECTIONS: Section[] = ['Overview', 'Members', 'Loans', 'Records', 'Admin']

/** Today's date and, for Loan Officers and up, how many applications wait at their step. */
function TodayBox() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const staff = atLeast(session?.role, 'loan_officer')
  const [waiting, setWaiting] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  // Counted again on each page change, so it follows signatures made elsewhere.
  useEffect(() => {
    if (!staff) return
    let live = true
    api<{ applications: LoanApplication[] }>('/api/applications')
      .then((d) => {
        if (!live) return
        setWaiting(d.applications.filter((a) => awaitingUser(a, session?.role, session?.id)).length)
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [staff, session?.role, session?.id, pathname])

  // Read once when the sidebar mounts; sessions last at most 8 hours.
  const [today] = useState(() => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  if (failed) return null
  return (
    <div className="mx-3 mb-3 rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-brand-300 uppercase">
        <CalendarDays className="h-3 w-3" /> Today
      </p>
      <p className="mt-0.5 text-sm font-medium text-white">{today}</p>
      {staff && waiting !== null && (
        <NavLink to="/loans/pending" className="mt-1.5 flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-xs text-brand-100 transition hover:bg-white/10 hover:text-white">
          <span>Waiting at your step</span>
          <span className={`rounded-full px-2 py-0.5 font-bold ${waiting > 0 ? 'bg-accent text-white' : 'bg-white/10 text-brand-200'}`}>{waiting}</span>
        </NavLink>
      )}
    </div>
  )
}

/**
 * How many payments wait on this role: To receive for the Treasurer, To confirm for the Bookkeeper.
 * Counted again on each page change and when the Payments page acts on one.
 */
function usePaymentsBadge(role: Role | undefined) {
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener('udei:payments-changed', bump)
    return () => window.removeEventListener('udei:payments-changed', bump)
  }, [])
  useEffect(() => {
    if (role !== 'treasurer' && role !== 'bookkeeper') return
    let live = true
    api<{ submitted: number; received: number }>('/api/payments/counts')
      .then((c) => live && setCount(role === 'treasurer' ? c.submitted : c.received))
      .catch(() => live && setCount(0))
    return () => {
      live = false
    }
  }, [role, pathname, tick])
  return role === 'treasurer' || role === 'bookkeeper' ? count : 0
}

export default function AppLayout() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const role = session?.role
  const paymentsWaiting = usePaymentsBadge(role)
  const badge = (b?: 'payments') =>
    b === 'payments' && paymentsWaiting > 0 ? (
      <span className="ml-auto rounded-full bg-accent px-1.5 text-xs font-bold text-white" aria-label={`${paymentsWaiting} waiting`}>{paymentsWaiting}</span>
    ) : null
  const items = nav
    .filter((n) => (n.roles ? !!role && n.roles.includes(role) : atLeast(role, n.min ?? 'staff')))
    .map((n) => (n.to === '/loans' && !atLeast(role, 'loan_officer') ? { ...n, label: 'My Loans' } : n))
  // Long menus (Loan Officer and up) don't fit in one row, so on desktop they go in a sidebar instead.
  const wide = items.length > 6
  // Members get a bottom tab bar below lg instead of a menu, and their header links from lg up.
  const member = !atLeast(role, 'loan_officer')
  const hide = wide || member ? 'lg:hidden' : 'xl:hidden'
  const desktop = member ? 'lg:flex' : 'xl:flex'

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition ${
      isActive ? 'bg-linear-to-r from-white/20 to-white/5 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
    }`
  // In the sidebar the current page also gets an accent bar on its left edge.
  const sideClass = (a: { isActive: boolean }) => `${linkClass(a)} gap-2 px-3 ${a.isActive ? 'shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`
  const icon = (Icon: typeof Users) => <Icon className="h-4 w-4 shrink-0 transition-transform motion-safe:group-hover:translate-x-0.5" />

  const profile = (
    <NavLink to="/profile" title="Your profile" className={({ isActive }) =>
        `flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 transition ${isActive ? 'bg-white/15' : 'hover:bg-white/10'}`}>
      <UserRound className="h-5 w-5 shrink-0 text-brand-100" />
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate text-sm font-semibold text-white">{session?.fullName}</span>
        <span className="block text-xs text-brand-200">{session ? roleLabel[session.role] : ''}</span>
      </span>
    </NavLink>
  )

  return (
    <div className={`min-h-screen ${wide ? 'lg:flex' : ''}`}>
      {wide && (
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[#0B422A] bg-grad-sidebar shadow-md lg:flex print:hidden">
          <NavLink to={homePath(role)} aria-label="UDEI home" className="flex h-16 shrink-0 items-center px-5">
            <BrandLogo light compact />
          </NavLink>
          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2" aria-label="Main">
            {SECTIONS.map((section) => {
              const list = items.filter((n) => n.section === section)
              if (!list.length) return null
              return (
                <div key={section}>
                  <p className="mb-1 px-3 text-[10px] font-semibold tracking-wider text-brand-300 uppercase">{section}</p>
                  <div className="flex flex-col gap-0.5">
                    {list.map(({ to, label, icon: Icon, end, badge: b }) => (
                      <NavLink key={to} to={to} end={end} className={sideClass}>
                        {icon(Icon)}
                        {label}
                        {badge(b)}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )
            })}
          </nav>
          <TodayBox />
          <div className="flex flex-col gap-1 border-t border-white/10 p-3">
            {profile}
            <button onClick={onLogout} className="btn justify-start px-3 text-brand-100 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>
      )}

      <div className={wide ? 'min-w-0 flex-1' : ''}>
      <header className={`sticky top-0 z-40 bg-[#0B422A] bg-grad-header shadow-md print:hidden ${wide ? 'lg:hidden' : ''}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to={homePath(role)} aria-label="UDEI home">
            <BrandLogo light compact />
          </NavLink>

          {!wide && (
          <nav className={`hidden items-center gap-0.5 ${desktop}`} aria-label="Main">
            {items.map(({ to, label, icon: Icon, end, badge: b }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                {icon(Icon)}
                {label}
                {badge(b)}
              </NavLink>
            ))}
          </nav>
          )}

          {!wide && (
          <div className={`hidden items-center gap-3 ${desktop}`}>
            {profile}
            <button onClick={onLogout} className="btn px-3 text-brand-100 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
          )}

          {!member && (
          <button
            className={`rounded-lg p-2 text-white hover:bg-white/10 ${hide}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          )}
        </div>

        {open && !member && (
          <div className={`border-t border-white/10 px-4 pb-4 ${hide}`}>
            <nav className="mt-3 flex flex-col gap-1" aria-label="Mobile">
              {items.map(({ to, label, icon: Icon, end, badge: b }) => (
                <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setOpen(false)}>
                  {icon(Icon)}
                  {label}
                  {badge(b)}
                </NavLink>
              ))}
              <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
                {icon(UserRound)}
                Profile
              </NavLink>
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm text-white">{session?.fullName}</p>
                <p className="text-xs text-brand-200">{session ? roleLabel[session.role] : ''}</p>
              </div>
              <button onClick={onLogout} className="btn px-3 text-brand-100 hover:bg-white/10">
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Members: room at the bottom for the tab bar below lg, so it never covers content. */}
      <main className={`mx-auto px-4 py-8 sm:px-6 print:max-w-none print:p-0 ${wide ? 'max-w-[96rem]' : 'max-w-7xl'} ${member ? 'pb-32 lg:pb-8' : ''}`}>
        <Outlet />
        <SessionTimeout />
      </main>
      {member && <MemberTabBar />}
      </div>
    </div>
  )
}
