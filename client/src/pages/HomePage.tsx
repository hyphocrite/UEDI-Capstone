import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, BellRing, CalendarCheck, ChevronDown, CircleCheck, Cpu, HandCoins, Link2, PenLine,
  PiggyBank, ShieldCheck, Smartphone, UserPlus, Users, Wallet,
} from 'lucide-react'
import dnscSeal from '../assets/dnsc-seal.png'
import BrandLogo from '../components/BrandLogo'
import Motif from '../components/Motif'
import { useAuth } from '../context/AuthContext'

const YEAR = new Date().getFullYear()

const nav = [
  ['#features', 'Features'],
  ['#how-it-works', 'How it works'],
  ['#member-app', 'Member app'],
  ['#faq', 'FAQ'],
] as const

const highlights = [
  { icon: PenLine, value: '4 signers', text: 'Bookkeeper, Credit Committee Chairman, President and Treasurer' },
  { icon: Cpu, value: '3 ML models', text: 'A second opinion on every application, explained in plain words' },
  { icon: Wallet, value: 'Every payday', text: 'Mutual assistance payments and plan contributions deducted from payroll' },
  { icon: Smartphone, value: 'Phone app', text: 'Members apply and follow their mutual assistance from their phone' },
]

const features = [
  { icon: HandCoins, title: 'Mutual assistance', text: 'Record mutual assistance releases, track payments and see every balance at a glance.' },
  { icon: PiggyBank, title: 'Retirement plans', text: "Follow each member's plan and how much is left to pay until it is complete." },
  { icon: BarChart3, title: 'Daily, monthly and yearly reports', text: 'Collections, releases and plan payments summarized for management, ready to print or export.' },
  { icon: BellRing, title: 'Early warning', text: 'Mutual assistance that starts to look risky is flagged early, so the office can talk to the member in time.' },
  { icon: CalendarCheck, title: 'Meetings and attendance', text: 'Keep attendance for general assemblies and meetings with the member records.' },
  { icon: ShieldCheck, title: 'Secure staff accounts', text: 'Each staff member signs in with their own account and role. Every change is kept in the audit log.' },
]

const steps = [
  { icon: UserPlus, title: 'Create an account', text: 'Sign up on the website or the phone app. You get your own member ID right away.' },
  { icon: Link2, title: 'Get linked by the office', text: 'The office links your account to your UDEI member number, and your records come together.' },
  { icon: HandCoins, title: 'Apply for mutual assistance', text: 'Fill in the form, add your co-makers for larger mutual assistance and upload your documents.' },
  { icon: CircleCheck, title: 'Four signatures, then release', text: 'The machine learning models give a suggestion; the four signers decide. You can follow each step.' },
]

const audiences = [
  { icon: Users, title: 'For members', text: 'Apply, follow and pay your mutual assistance without visiting the office.' },
  { icon: ShieldCheck, title: 'For the office', text: 'Every application arrives complete, scored and ready to sign.' },
]

const faqs = [
  {
    q: 'Who can use the system?',
    a: 'UDEI members, to apply for mutual assistance and follow their mutual assistance and retirement plan, and UDEI office staff, to manage members, mutual assistance, deductions and reports.',
  },
  {
    q: 'Do I need a co-maker?',
    a: "For UDEI members a co-maker is optional; the signers may ask for one case by case, and you'll see why on My Mutual Assistance. Applicants who aren't UDEI members yet always need a member as co-maker.",
  },
  {
    q: 'Does a computer decide my mutual assistance?',
    a: 'No. Three machine learning models suggest approve, review or deny and explain why in plain words, but the Bookkeeper, Credit Committee Chairman, President and Treasurer make the decision.',
  },
  {
    q: 'I already have a UDEI member number. Why do I get a new ID?',
    a: 'Every new account gets its own ID so you can start right away. Once the office links your account to your member number, everything you filed moves to your member record.',
  },
  {
    q: 'How are payments made?',
    a: 'Mutual assistance installments and retirement plan contributions are deducted from your pay every payday, and the office records each deduction.',
  },
]

export default function HomePage() {
  const { session } = useAuth()
  const start = session ? '/dashboard' : '/register'

  return (
    <div className="min-h-screen">
      <header className="bg-[#0B422A] bg-grad-header">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandLogo light />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition hover:bg-white/10 hover:text-white">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Link to="/dashboard" className="btn-accent">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn px-3 text-brand-100 hover:bg-white/10 hover:text-white">
                  Sign in
                </Link>
                <Link to="/register" className="btn-accent">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-[#0B422A] to-brand-600 text-white">
        <Motif corner="bottom-left" className="w-[min(75vw,28rem)] text-white/35" />
        <Motif corner="top-right" className="hidden w-[min(40vw,26rem)] text-white/20 lg:block" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-100 uppercase backdrop-blur-sm">
              UDEI member services
            </p>
            <h1 className="text-4xl leading-tight font-bold sm:text-5xl">
              Mutual assistance (loans) and retirement plans, managed in one place.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-brand-100">
              A single system for UDEI staff to manage members, release and collect mutual assistance, follow
              retirement plan payments and report to management.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={start} className="btn-accent px-5 py-3 text-base">
                {session ? 'Go to dashboard' : 'Get started'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!session && (
                <Link to="/login" className="btn border border-white/30 px-5 py-3 text-base text-white backdrop-blur-sm hover:bg-white/10">
                  I already have an account
                </Link>
              )}
            </div>
          </div>

          <div className="card border-white/10 bg-white/95 p-6 text-ink shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-700">Retirement plan snapshot</p>
                <p className="mt-1 text-xs text-brand-500">Sample member</p>
              </div>
              {/* UDEI is the DNSC employees' association. */}
              <img src={dnscSeal} alt="Davao del Norte State College seal" draggable={false} className="h-[50px] w-[50px] shrink-0 select-none" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-sm text-brand-600">Remaining to pay</p>
                <p className="text-3xl font-bold text-brand-800">₱288,000</p>
              </div>
              <p className="text-sm text-brand-600">96 months left</p>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-brand-100">
              <div className="animate-grow-right h-full w-[47%] rounded-full bg-accent bg-grad-bar-x" />
            </div>
            <p className="mt-2 text-xs text-brand-600">47% of ₱540,000 paid</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                ['Active mutual assistance', '6'],
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

      {/* What sets the process apart, at a glance. */}
      <section className="border-b border-brand-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-px bg-brand-100 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map(({ icon: Icon, value, text }) => (
            <div key={value} className="flex items-start gap-3 bg-white px-4 py-6 sm:px-6">
              <span className="rounded-lg bg-brand-50 p-2 text-brand-700"><Icon className="h-5 w-5" /></span>
              <div>
                <p className="font-bold text-brand-800">{value}</p>
                <p className="mt-0.5 text-sm text-brand-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-16 sm:px-6 lg:py-20">
        <p className="text-center text-xs font-semibold tracking-wider text-accent-dark uppercase">Features</p>
        <h2 className="mt-2 text-center text-2xl font-bold text-brand-800 sm:text-3xl">Everything the office needs</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-brand-600">
          From the first application to the last payroll deduction, the records stay in one place.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card card-hover p-6">
              <span className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-700">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-brand-800">{title}</h3>
              <p className="mt-2 text-sm text-brand-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-4 border-y border-brand-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-center text-xs font-semibold tracking-wider text-accent-dark uppercase">How it works</p>
          <h2 className="mt-2 text-center text-2xl font-bold text-brand-800 sm:text-3xl">From sign-up to mutual assistance release</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-800 bg-grad-brand text-sm font-bold text-white">{i + 1}</span>
                  {i < steps.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-brand-200 lg:block" />}
                </div>
                <h3 className="mt-4 flex items-center gap-2 font-semibold text-brand-800">
                  <Icon className="h-4 w-4 text-accent-dark" /> {title}
                </h3>
                <p className="mt-2 text-sm text-brand-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="member-app" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-wider text-accent-dark uppercase">Member app</p>
            <h2 className="mt-2 text-2xl font-bold text-brand-800 sm:text-3xl">Your mutual assistance, on your phone</h2>
            <p className="mt-3 text-brand-600">
              The UDEI member app for Android uses the same account as this website.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Apply for mutual assistance and upload your documents',
                'See where your application is and who has signed',
                'Check your mutual assistance balances and your retirement plan',
                'Agree or decline when someone asks you to be their co-maker',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-brand-700">
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-brand-500">Ask the UDEI office for the app download link.</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-[#0B422A] bg-grad-hero p-8 text-white shadow-xl">
            <Motif corner="bottom-right" className="w-[min(70vw,22rem)] text-white/30" />
            <div className="relative grid gap-4 sm:grid-cols-2">
              {audiences.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl bg-white/10 p-5 backdrop-blur-sm">
                  <Icon className="h-6 w-6 text-emerald-300" />
                  <p className="mt-3 font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-brand-100">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-4 border-t border-brand-100 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-center text-xs font-semibold tracking-wider text-accent-dark uppercase">FAQ</p>
          <h2 className="mt-2 text-center text-2xl font-bold text-brand-800 sm:text-3xl">Common questions</h2>
          <div className="mt-8 divide-y divide-brand-100 rounded-xl border border-brand-100">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-brand-800">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-brand-500 transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm text-brand-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#0B422A] bg-grad-header text-white">
        <Motif corner="top-left" className="w-[min(70vw,24rem)] text-white/30" />
        <Motif corner="bottom-right" className="w-[min(70vw,24rem)] text-white/30" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">{session ? 'Welcome back.' : 'Ready to get started?'}</h2>
          <p className="max-w-xl text-brand-100">
            {session ? 'Your dashboard has everything waiting for you.' : 'Create your account in a minute. The office links it to your UDEI member number.'}
          </p>
          <Link to={start} className="btn-accent px-5 py-3 text-base">
            {session ? 'Go to dashboard' : 'Create account'} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-brand-900 text-brand-200">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <BrandLogo light />
            <p className="mt-3 text-sm">United DNSC Employees, Inc. Mutual assistance and retirement plans for UDEI members.</p>
            <p className="mt-2 text-sm"><Link to="/privacy" className="underline transition hover:text-white">Privacy Notice</Link></p>
          </div>
          <nav aria-label="Footer">
            <p className="text-xs font-semibold tracking-wider text-white uppercase">On this page</p>
            <ul className="mt-3 space-y-2 text-sm">
              {nav.map(([href, label]) => (
                <li key={href}><a href={href} className="transition hover:text-white">{label}</a></li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-xs font-semibold tracking-wider text-white uppercase">Account</p>
            <ul className="mt-3 space-y-2 text-sm">
              {session ? (
                <li><Link to="/dashboard" className="transition hover:text-white">Dashboard</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="transition hover:text-white">Sign in</Link></li>
                  <li><Link to="/register" className="transition hover:text-white">Create account</Link></li>
                </>
              )}
            </ul>
          </div>
        </div>
        <p className="border-t border-white/10 py-5 text-center text-xs text-brand-300">© {YEAR} UDEI. All rights reserved.</p>
      </footer>
    </div>
  )
}
