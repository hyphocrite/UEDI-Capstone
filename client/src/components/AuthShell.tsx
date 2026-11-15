import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import Motif from './Motif'

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
        {/* The UDEI motif in two corners, clearest at the edge and fading toward the form. */}
        <Motif corner="bottom-left" className="w-[min(80vw,34rem)] text-brand-600/70" />
        <Motif corner="top-right" className="hidden w-[min(45vw,24rem)] text-brand-600/50 sm:block" />
        <div className="relative w-full max-w-md">
          <div className="card p-8 shadow-lg">
            <h1 className="text-2xl font-bold text-brand-800">{title}</h1>
            <p className="mt-1 text-sm text-brand-600">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-brand-600">{footer}</p>
        </div>
      </main>
    </div>
  )
}
