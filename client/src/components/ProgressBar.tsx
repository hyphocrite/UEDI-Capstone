type Props = { value: number; label?: string }

/** value is 0–100 */
export default function ProgressBar({ value, label }: Props) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-brand-100"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-medium text-brand-700">{v}%</span>
    </div>
  )
}
