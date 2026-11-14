import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Props = { icon: LucideIcon; title: string; hint?: string; action?: ReactNode; className?: string }

/** A friendly "nothing here" for lists and tables: icon, one line of title, one muted hint. */
export default function EmptyState({ icon: Icon, title, hint, action, className = 'py-10' }: Props) {
  return (
    <div className={`flex flex-col items-center px-4 text-center ${className}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-brand-800">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-brand-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
