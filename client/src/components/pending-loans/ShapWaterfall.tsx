import { creditScore } from '../../lib/applications'
import type { ShapWaterfall as Waterfall } from '../../lib/applications'

type Row = { key: string; label: string; from: number; to: number; kind: 'base' | 'factor' | 'end' }

/** Yes/no factors read better with their value, e.g. "Emergency loan: yes". */
const YES_NO = new Set(['loan_type_emergency', 'employment_not_permanent'])
const labelOf = (f: Waterfall['factors'][number]) => (YES_NO.has(f.feature) ? `${f.label}: ${f.value ? 'yes' : 'no'}` : f.label)

/**
 * SHAP waterfall for the XGBoost model: starts at the average applicant (the explainer's base value),
 * adds one bar per factor (red pushes toward default, green toward repayment, largest first) and
 * ends at this application, with its credit score. The values are log-odds; the axis says which
 * way each bar pushes instead of showing them.
 */
export default function ShapWaterfall({ data }: { data: Waterfall }) {
  const rows: Row[] = [{ key: 'base', label: 'Average applicant', from: data.baseValue, to: data.baseValue, kind: 'base' }]
  let at = data.baseValue
  for (const f of data.factors) {
    rows.push({ key: f.feature, label: labelOf(f), from: at, to: at + f.shap, kind: 'factor' })
    at += f.shap
  }
  if (Math.abs(data.otherFeatures) >= 0.005) {
    rows.push({ key: 'other', label: 'All other factors', from: at, to: at + data.otherFeatures, kind: 'factor' })
  }
  rows.push({ key: 'end', label: 'This application', from: data.output, to: data.output, kind: 'end' })

  const points = rows.flatMap((r) => [r.from, r.to])
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const pad = Math.max((hi - lo) * 0.06, 0.05)
  const min = lo - pad
  const span = hi + pad - min
  const x = (v: number) => ((v - min) / span) * 100
  const score = creditScore(data.outputProbability)

  return (
    <figure className="min-w-0">
      <div className="mb-2 flex justify-between gap-2 text-[11px] font-semibold tracking-wide uppercase sm:ml-[40%]">
        <span className="text-emerald-700">← Pushes toward repayment</span>
        <span className="text-red-700">Pushes toward default →</span>
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const left = Math.min(x(r.from), x(r.to))
          const width = Math.abs(x(r.to) - x(r.from))
          const up = r.to > r.from
          return (
            <li key={r.key} className="grid grid-cols-1 items-center gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[40%_1fr]">
              <span className={`min-w-0 truncate ${r.kind === 'factor' ? 'text-ink' : 'font-semibold text-brand-800'}`} title={r.label}>
                {r.label}
              </span>
              <div className="relative h-5 rounded bg-brand-50/60">
                {r.kind === 'factor' ? (
                  <div
                    className={`animate-grow-right absolute top-0.5 bottom-0.5 rounded-sm ${up ? 'bg-red-400' : 'bg-emerald-500'}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%`, animationDelay: `${i * 50}ms`, transformOrigin: up ? 'left' : 'right' }}
                    title={up ? 'Pushes toward default' : 'Pushes toward repayment'}
                  />
                ) : (
                  <div className={`absolute -top-0.5 -bottom-0.5 w-1 -translate-x-1/2 rounded ${r.kind === 'end' ? 'bg-brand-800' : 'bg-brand-400'}`} style={{ left: `${x(r.to)}%` }} />
                )}
                {r.kind === 'end' && (
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 rounded bg-brand-800 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white ${x(r.to) > 60 ? '-translate-x-full' : ''}`}
                    style={{ left: x(r.to) > 60 ? `calc(${x(r.to)}% - 8px)` : `calc(${x(r.to)}% + 8px)` }}
                  >
                    Credit score {score}
                  </span>
                )}
                {/* A faint guide at each step's end, so the bars read as one running total. */}
                {r.kind === 'factor' && <div className="absolute -bottom-2 h-2 w-px bg-brand-200" style={{ left: `${x(r.to)}%` }} />}
              </div>
            </li>
          )
        })}
      </ol>
      <figcaption className="mt-3 text-xs text-brand-500">
        From the average applicant, each factor moves the XGBoost model's estimate toward default (red) or repayment (green), largest first.
        It ends at this application: XGBoost credit score {score} / 100.
        SHAP values on the model's log-odds scale.
      </figcaption>
    </figure>
  )
}
