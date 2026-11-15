import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import dnscSeal from '../assets/dnsc-seal.png'
import BrandLogo from './BrandLogo'
import CornerPattern from './CornerPattern'

type Props = { title: string; subtitle: string; children: ReactNode; footer: ReactNode }

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-[#0B422A] bg-grad-header">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Link to="/" aria-label="UDEI home">
            <BrandLogo light />
          </Link>
        </div>
      </header>
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
        {/* Lines and arcs in the corners, framing the card. */}
        <CornerPattern className="text-brand-600/70" />
        <div className="relative w-full max-w-md">
          <div className="relative">
            {/* The DNSC seal behind the card, as on the home page. */}
            <img src={dnscSeal} alt="" aria-hidden="true" draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 w-[min(110vw,38rem)] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-15 select-none print:hidden" />
            <div className="card relative p-8 shadow-lg">
              <h1 className="text-2xl font-bold text-brand-800">{title}</h1>
              <p className="mt-1 text-sm text-brand-600">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
          </div>
          <p className="relative mt-6 text-center text-sm text-brand-600">{footer}</p>
        </div>
      </main>
    </div>
  )
}
