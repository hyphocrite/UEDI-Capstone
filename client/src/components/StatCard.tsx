import type { LucideIcon } from 'lucide-react'

type Props = { label: string; value: string; hint?: string; icon: LucideIcon }

/**
 * A summary number. Cards in a row share one height (the hint sits at the bottom) and an accent
 * line on top, so a row reads as one strip.
 */
export default function StatCard({ label, value, hint, icon: Icon }: Props) {
  return (
    <div className="card card-hover group flex h-full items-start gap-4 border-t-2 border-t-accent p-5">
      <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700 transition-colors group-hover:bg-accent/15">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex h-full min-w-0 flex-col">
        <p className="text-sm text-brand-600">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-auto pt-0.5 text-xs text-brand-500">{hint}</p>}
      </div>
    </div>
  )
}
