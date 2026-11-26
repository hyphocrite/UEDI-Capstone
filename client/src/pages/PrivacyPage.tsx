import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import { api } from '../lib/api'
import { NOTICE, PRIVACY_NOTICE_VERSION } from '../lib/privacy'

/** The Privacy Notice (RA 10173). Public: linked from the footer, sign-up and the application form. */
export default function PrivacyPage() {
  const [contact, setContact] = useState<string | null>(null)
  useEffect(() => {
    api<{ contactEmail: string | null }>('/api/privacy').then((d) => setContact(d.contactEmail)).catch(() => setContact(null))
  }, [])

  return (
    <div className="min-h-screen bg-brand-50/40">
      <header className="bg-[#0B422A] bg-grad-header">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="UDEI home"><BrandLogo light compact /></Link>
          <Link to="/" className="text-sm text-brand-100 hover:text-white"><ArrowLeft className="mr-1 inline h-4 w-4" />Home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-800 bg-grad-brand text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-brand-800">Privacy Notice</h1>
            <p className="mt-1 text-sm text-brand-600">Republic Act No. 10173, the Data Privacy Act of 2012 · version {PRIVACY_NOTICE_VERSION}</p>
          </div>
        </div>
        <div className="card mt-6 space-y-5 p-5 text-sm text-ink sm:p-6">
          {NOTICE.map((s) => (
            <section key={s.title}>
              <h2 className="font-semibold text-brand-800">{s.title}</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-brand-900">
                {s.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </section>
          ))}
          <section>
            <h2 className="font-semibold text-brand-800">Contact</h2>
            <p className="mt-1 text-brand-900">
              For questions or to use your rights, write to the UDEI office{contact ? <> at <a className="font-semibold underline" href={`mailto:${contact}`}>{contact}</a></> : ''}, or visit the office at
              Davao del Norte State College, New Visayas, Panabo City.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
