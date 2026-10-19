import type { Suggestion } from '../../lib/applications'

const styles: Record<Suggestion, { label: string; className: string }> = {
  approve: { label: 'Approve', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  review: { label: 'Review', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  deny: { label: 'Deny', className: 'bg-red-50 text-red-700 ring-red-200' },
}

export default function SuggestionBadge({ suggestion, large = false }: { suggestion: Suggestion; large?: boolean }) {
  const s = styles[suggestion]
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ring-inset ${s.className} ${large ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {s.label}
    </span>
  )
}
