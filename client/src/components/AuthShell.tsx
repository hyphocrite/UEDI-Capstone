import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import BrandLogo from './BrandLogo'

type Props = { title: string; subtitle: string; children: ReactNode; footer: ReactNode }

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-[#0B422A]">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Link to="/" aria-label="UEDI home">
            <BrandLogo light />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="card p-8">
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
