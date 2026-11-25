// Pieces of UDEI's paper forms, used to print an application the way it is signed: typed answers
// on underlined blanks, tick boxes, and signature lines. Black on white on screen too, like the paper.
import type { ReactNode } from 'react'

/** One printed sheet. `next` starts it on a new page when printed. */
export function Sheet({ children, next = false, label }: { children: ReactNode; next?: boolean; label: string }) {
  return (
    <article
      aria-label={label}
      className={`min-w-0 space-y-4 rounded-sm bg-white p-5 text-[13px] leading-relaxed text-black shadow-md ring-1 ring-black/10 sm:p-10 print:space-y-2.5 print:rounded-none print:p-0 print:text-[9.5pt] print:leading-snug print:shadow-none print:ring-0 ${
        next ? 'print:break-before-page' : ''
      }`}
    >
      {children}
    </article>
  )
}

/** The letterhead at the top of each sheet. */
export function Letterhead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <header className="text-center">
      <p className="text-lg font-bold tracking-wide uppercase sm:text-xl">United DNSC Employees, Inc.</p>
      <p>New Visayas, Panabo City</p>
      <p className="mt-2 text-base font-bold tracking-wide uppercase sm:text-lg">{title}</p>
      {note && <p className="mt-1 text-xs text-gray-600">{note}</p>}
    </header>
  )
}

/** A heading in capitals across the sheet, like the form's section titles. */
export const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="break-after-avoid pt-2 text-sm font-bold tracking-wide uppercase print:pt-1 print:text-[10pt]">{children}</h3>
)

/** A typed answer on an underlined blank. Empty blanks stay as a line to write on. */
export function Fill({ children, className = '', caption }: { children?: ReactNode; className?: string; caption?: string }) {
  const empty = children === undefined || children === null || children === ''
  return (
    <span className={`inline-flex min-w-0 flex-col ${className}`}>
      <span className="min-h-[1.5em] border-b border-black px-1 font-semibold break-words">{empty ? ' ' : children}</span>
      {caption && <span className="text-center text-[10px] text-gray-600">{caption}</span>}
    </span>
  )
}

/** "Label: ______" on one line; the blank takes the rest of the line. */
export function Field({ label, children, className = '' }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <p className={`flex min-w-0 flex-wrap items-end gap-x-2 ${className}`}>
      <span className="shrink-0">{label}:</span>
      <Fill className="min-w-[4rem] flex-1">{children}</Fill>
    </p>
  )
}

/** A tick box with its label. */
export function Box({ checked, children }: { checked: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1.5">
      <span
        role="img"
        aria-label={checked ? 'checked' : 'not checked'}
        className="mt-[0.2em] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-black text-[11px] leading-none font-bold"
      >
        {checked ? '✓' : ''}
      </span>
      <span>{children}</span>
    </span>
  )
}

/** A signature line with the printed name above it (blank when not known yet). */
export function Signature({ title, name, className = '' }: { title: string; name?: string; className?: string }) {
  return (
    <div className={`min-w-0 break-inside-avoid pt-8 print:pt-6 ${className}`}>
      <p className="min-h-[1.5em] text-center font-semibold break-words uppercase">{name ?? ''}</p>
      <p className="border-t border-black pt-0.5 text-center text-[11px]">{title}</p>
    </div>
  )
}

/** A blank in parentheses, kept together on one line, e.g. the amount in words. */
export const InParens = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <span className="inline-flex max-w-full items-end">
    (<Fill className={className}>{children}</Fill>)
  </span>
)
