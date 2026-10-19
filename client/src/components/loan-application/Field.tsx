import type { ReactNode } from 'react'

type Props = { id: string; label: string; hint?: string; className?: string; children: ReactNode }

/** A labelled form control. min-w-0 keeps it from widening grid columns at phone width. */
export default function Field({ id, label, hint, className = '', children }: Props) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-brand-500">{hint}</p>}
    </div>
  )
}

/** Section card with a heading, used for each part of the paper form. */
export function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className={`font-semibold text-brand-800 ${subtitle ? 'mb-1' : 'mb-4'}`}>{title}</h2>
      {subtitle && <p className="mb-4 text-xs text-brand-500">{subtitle}</p>}
      {children}
    </section>
  )
}
