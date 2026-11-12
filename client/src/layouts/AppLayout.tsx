import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, BrainCircuit, CalendarCheck, Handshake, History, Link2, Siren, ClipboardCheck, FilePlus2, HandCoins, LogOut, Menu, PiggyBank, ReceiptText, Settings, UserRound, Users, X } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import SessionTimeout from '../components/SessionTimeout'
import { useAuth } from '../context/AuthContext'
import { atLeast, homePath, roleLabel } from '../lib/roles'
import type { Role } from '../lib/roles'

// min: shown to this role and every role above it (see lib/roles.ts). roles: shown only to these roles.
// Must match the route guards in App.tsx.
const nav: { to: string; label: string; icon: typeof Users; end?: boolean; min?: Role; roles?: Role[] }[] = [
  { to: '/members', label: 'Members', icon: Users, min: 'loan_officer' },
  { to: '/member-accounts', label: 'Member Accounts', icon: Link2, min: 'loan_officer' },
  { to: '/loans', label: 'Loans', icon: HandCoins, end: true },
  { to: '/loans/apply', label: 'Apply for a Loan', icon: FilePlus2 },
  { to: '/co-maker', label: 'Co-maker', icon: Handshake },
  { to: '/loans/pending', label: 'Pending Loans', icon: ClipboardCheck, min: 'loan_officer' },
  { to: '/early-warning', label: 'Early Warning', icon: Siren, min: 'loan_officer' },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, min: 'loan_officer' },
  { to: '/retirement-plans', label: 'Retirement Plans', icon: PiggyBank, min: 'loan_officer' },
  { to: '/deductions', label: 'Payroll Deductions', icon: ReceiptText, roles: ['bookkeeper', 'treasurer', 'admin'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, min: 'treasurer' },
  { to: '/settings', label: 'Loan Settings', icon: Settings, min: 'crecom_chair' },
  { to: '/credit-model', label: 'Credit Model', icon: BrainCircuit, min: 'admin' },
  { to: '/audit-log', label: 'Audit Log', icon: History, min: 'admin' },
]

export default function AppLayout() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const role = session?.role
  const items = nav
    .filter((n) => (n.roles ? !!role && n.roles.includes(role) : atLeast(role, n.min ?? 'staff')))
    .map((n) => (n.to === '/loans' && !atLeast(role, 'loan_officer') ? { ...n, label: 'My Loans' } : n))
  // Long menus (Treasurer and up) don't fit in one row, so on desktop they go in a sidebar instead.
  const wide = items.length > 6
  const hide = wide ? 'lg:hidden' : 'xl:hidden'

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition ${
      isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
    }`

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
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[#0B422A] shadow-md lg:flex print:hidden">
          <NavLink to={homePath(role)} aria-label="UDEI home" className="flex h-16 items-center px-5">
            <BrandLogo light compact />
          </NavLink>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2" aria-label="Main">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={(a) => `${linkClass(a)} px-3`}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
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
      <header className={`sticky top-0 z-40 bg-[#0B422A] shadow-md print:hidden ${wide ? 'lg:hidden' : ''}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to={homePath(role)} aria-label="UDEI home">
            <BrandLogo light compact />
          </NavLink>

          {!wide && (
          <nav className={`hidden items-center gap-0.5 xl:flex`} aria-label="Main">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          )}

          {!wide && (
          <div className={`hidden items-center gap-3 xl:flex`}>
            {profile}
            <button onClick={onLogout} className="btn px-3 text-brand-100 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
          )}

          <button
            className={`rounded-lg p-2 text-white hover:bg-white/10 ${hide}`}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open && (
          <div className={`border-t border-white/10 px-4 pb-4 ${hide}`}>
            <nav className="mt-3 flex flex-col gap-1" aria-label="Mobile">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setOpen(false)}>
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
              <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
                <UserRound className="h-4 w-4" />
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <Outlet />
        <SessionTimeout />
      </main>
      </div>
    </div>
  )
}
