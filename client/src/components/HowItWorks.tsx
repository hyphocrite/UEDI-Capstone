import type { ReactNode } from 'react'
import { ChevronDown, Info } from 'lucide-react'

/**
 * Longer how-it-works text, closed by default, so page subtitles stay one short line.
 * `label` defaults to "How this works"; `open` for places that should start open (staff views).
 */
export default function HowItWorks({ children, label = 'How this works', open = false, className = '' }: { children: ReactNode; label?: string; open?: boolean; className?: string }) {
  return (
    <details className={`group text-sm ${className}`} open={open || undefined}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5" /> {label}
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2 text-brand-700">{children}</div>
    </details>
  )
}
