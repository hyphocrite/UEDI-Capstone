const tones: Record<string, string> = {
  Active: 'bg-brand-50 text-brand-700 ring-brand-200',
  'On track': 'bg-brand-50 text-brand-700 ring-brand-200',
  'Fully paid': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  Behind: 'bg-amber-50 text-amber-700 ring-amber-200',
  'Past due': 'bg-red-50 text-red-700 ring-red-200',
  Inactive: 'bg-gray-100 text-gray-600 ring-gray-200',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        tones[status] ?? 'bg-gray-100 text-gray-600 ring-gray-200'
      }`}
    >
      {status}
    </span>
  )
}
