import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, BrainCircuit, ClipboardCheck, FilePlus2, HandCoins, LogOut, Menu, PiggyBank, ReceiptText, Settings, Users, X } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/roles'
import type { Role } from '../lib/roles'

// roles: shown only to these roles; everyone sees items without it.
const nav: { to: string; label: string; icon: typeof Users; end?: boolean; roles?: Role[] }[] = [
  { to: '/members', label: 'Members', icon: Users },
  { to: '/loans', label: 'Loans', icon: HandCoins, end: true },
  { to: '/loans/apply', label: 'Loan Application', icon: FilePlus2 },
  { to: '/loans/pending', label: 'Pending Loans', icon: ClipboardCheck },
  { to: '/credit-model', label: 'Credit Model', icon: BrainCircuit },
  { to: '/deductions', label: 'Payroll Deductions', icon: ReceiptText, roles: ['bookkeeper', 'treasurer', 'admin'] },
  { to: '/retirement-plans', label: 'Retirement Plans', icon: PiggyBank },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const items = nav.filter((n) => !n.roles || (session && n.roles.includes(session.role)))

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition ${
      isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-[#0B422A] shadow-md print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/members" aria-label="UEDI home">
            <BrandLogo light compact />
          </NavLink>

          <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 xl:flex">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold whitespace-nowrap text-white">{session?.fullName}</p>
              <p className="text-xs text-brand-200">{session ? roleLabel[session.role] : ''}</p>
            </div>
            <button onClick={onLogout} className="btn px-3 text-brand-100 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>

          <button
            className="rounded-lg p-2 text-white hover:bg-white/10 xl:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-white/10 px-4 pb-4 xl:hidden">
            <nav className="mt-3 flex flex-col gap-1" aria-label="Mobile">
              {items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => setOpen(false)}>
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
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
      </main>
    </div>
  )
}
