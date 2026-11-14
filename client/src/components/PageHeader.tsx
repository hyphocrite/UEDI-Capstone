import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Props = { title: string; subtitle?: string; actions?: ReactNode; /** The page's menu icon. */ icon?: LucideIcon }

export default function PageHeader({ title, subtitle, actions, icon: Icon }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-800 text-white shadow-sm print:hidden">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-brand-600">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
