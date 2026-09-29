import { Link } from 'react-router-dom'
import { ArrowRight, HandCoins, PiggyBank, ShieldCheck, BarChart3 } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import { useAuth } from '../context/AuthContext'

const YEAR = new Date().getFullYear()

const features = [
  {
    icon: HandCoins,
    title: 'Member loans',
    text: 'Record loan releases, track payments and see every balance at a glance.',
  },
  {
    icon: PiggyBank,
    title: 'Retirement plans',
    text: "Follow each member's plan and how much is left to pay until it is complete.",
  },
  {
    icon: BarChart3,
    title: 'Daily, monthly and yearly reports',
    text: 'Collections, releases and plan payments summarized for management.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure staff accounts',
    text: 'Staff sign in with their own accounts, with passwords stored securely.',
  },
]

export default function HomePage() {
  const { session } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="bg-[#0B422A]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <BrandLogo light />
          <div className="flex items-center gap-2">
            {session ? (
              <Link to="/members" className="btn-accent">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn px-3 text-brand-100 hover:bg-white/10 hover:text-white">
                  Log in
                </Link>
                <Link to="/register" className="btn-accent">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#0B422A] to-brand-600 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-100 uppercase">
              UEDI member services
            </p>
            <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
              Loans and retirement plans, managed in one place.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-brand-100">
              A single system for UEDI staff to manage members, release and collect loans, follow
              retirement plan payments and report to management.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={session ? '/members' : '/register'} className="btn-accent px-5 py-3 text-base">
                {session ? 'Go to dashboard' : 'Get started'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!session && (
                <Link to="/login" className="btn border border-white/30 px-5 py-3 text-base text-white hover:bg-white/10">
                  I already have an account
                </Link>
              )}
            </div>
          </div>

          <div className="card border-white/10 bg-white/95 p-6 text-ink shadow-xl">
            <p className="text-sm font-semibold text-brand-700">Retirement plan snapshot</p>
            <p className="mt-1 text-xs text-brand-500">Sample member</p>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-sm text-brand-600">Remaining to pay</p>
                <p className="text-3xl font-bold text-brand-800">₱288,000</p>
              </div>
              <p className="text-sm text-brand-600">96 months left</p>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-brand-100">
              <div className="h-full w-[47%] rounded-full bg-accent" />
            </div>
            <p className="mt-2 text-xs text-brand-600">47% of ₱540,000 paid</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ['Active loans', '6'],
                ['Collected today', '₱58,400'],
                ['Plans on track', '4 of 7'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-brand-50 p-3">
                  <p className="text-sm font-bold text-brand-800">{v}</p>
                  <p className="text-[11px] text-brand-600">{k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-brand-800">Everything the office needs</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-6">
              <span className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-700">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-brand-800">{title}</h3>
              <p className="mt-2 text-sm text-brand-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-brand-100 py-6 text-center text-xs text-brand-500">
        © {YEAR} UEDI. All rights reserved.
      </footer>
    </div>
  )
}
