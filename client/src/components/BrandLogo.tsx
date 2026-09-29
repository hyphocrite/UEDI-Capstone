type Props = { light?: boolean; className?: string }

export default function BrandLogo({ light = false, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#10B981' : '#0B422A'} />
        <path
          d="M9 9v8a7 7 0 0 0 14 0V9"
          fill="none"
          stroke={light ? '#0B422A' : '#10B981'}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="leading-tight">
        <span className={`block text-base font-bold tracking-wide ${light ? 'text-white' : 'text-brand-800'}`}>
          UEDI
        </span>
        <span className={`hidden text-[11px] sm:block ${light ? 'text-brand-200' : 'text-brand-500'}`}>
          Loans and Retirement Plans
        </span>
      </span>
    </span>
  )
}
