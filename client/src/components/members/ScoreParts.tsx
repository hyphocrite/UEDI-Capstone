import type { MemberScore } from '../../lib/members'

/**
 * The member score part by part: label, weight, a bar and the detail. Staff see it in the Members
 * page score modal; members see their own on Home ("See how it's computed").
 */
export default function ScoreParts({ parts }: { parts: MemberScore['parts'] }) {
  return (
    <ul className="space-y-2 text-sm">
      {parts.map((p, i) => (
        <li key={p.key}>
          <div className="flex justify-between gap-2">
            <span className="font-medium text-ink">{p.label} <span className="text-xs font-normal text-brand-500">({p.weight}%)</span></span>
            <span className="shrink-0 text-brand-700">{p.value === null ? 'No data' : `${Math.round(p.value * 100)} / 100`}</span>
          </div>
          {p.value !== null && (
            <div className="mt-1 h-1.5 rounded-full bg-brand-100">
              <div className="animate-grow-right h-1.5 rounded-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%`, animationDelay: `${i * 60}ms` }} />
            </div>
          )}
          <p className="mt-0.5 text-xs text-brand-600">{p.detail}</p>
        </li>
      ))}
    </ul>
  )
}
