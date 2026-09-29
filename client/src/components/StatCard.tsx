import type { LucideIcon } from 'lucide-react'

type Props = { label: string; value: string; hint?: string; icon: LucideIcon }

export default function StatCard({ label, value, hint, icon: Icon }: Props) {
  return (
    <div className="card flex items-start gap-4 p-5">
      <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-brand-600">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-brand-500">{hint}</p>}
      </div>
    </div>
  )
}
