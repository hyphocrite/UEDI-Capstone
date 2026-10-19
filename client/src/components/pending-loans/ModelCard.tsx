import type { ModelScore } from '../../lib/applications'
import SuggestionBadge from './SuggestionBadge'

const blurb: Record<ModelScore['key'], string> = {
  xgboost: 'Boosted decision trees. Strong at spotting combinations of risk factors.',
  random_forest: 'Many decision trees voting together. Stable and hard to fool with one odd value.',
  logistic_regression: 'A weighted sum of factors. The easiest to explain line by line.',
}

/** Yes/no factors read better with their value, e.g. "Informal work: no". */
function factorLabel(f: ModelScore['topFactors'][number]) {
  const yesNo = ['loan_type_emergency', 'employment_not_permanent'].includes(f.feature)
  return yesNo ? `${f.label}: ${f.value ? 'yes' : 'no'}` : f.label
}

export default function ModelCard({ model }: { model: ModelScore }) {
  const maxImpact = Math.max(...model.topFactors.map((f) => Math.abs(f.impact)), 1e-6)
  return (
    <article className="card flex flex-col p-4" aria-label={`${model.name} result`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-brand-800">{model.name}</h3>
          <p className="mt-0.5 text-xs text-brand-500">{blurb[model.key]}</p>
        </div>
        <SuggestionBadge suggestion={model.suggestion} />
      </div>

      <p className="mt-3 text-3xl font-bold text-ink">
        {Math.round(model.defaultProbability * 100)}%
        <span className="ml-1 text-sm font-medium text-brand-500">chance of default</span>
      </p>
      {model.cvMetrics && (
        <p className="text-xs text-brand-500">
          Tested accuracy: AUC {model.cvMetrics.aucRoc.toFixed(2)} · flagged {Math.round(model.cvMetrics.recall * 100)}% of past defaults for review
        </p>
      )}

      <h4 className="mt-4 text-xs font-semibold tracking-wide text-brand-600 uppercase">Biggest factors</h4>
      <ul className="mt-2 space-y-2">
        {model.topFactors.map((f) => {
          const raises = f.impact > 0
          return (
            <li key={f.feature} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-ink">{factorLabel(f)}</span>
                <span className={raises ? 'text-red-700' : 'text-emerald-700'}>{raises ? 'raises risk' : 'lowers risk'}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-50">
                <div
                  className={`h-full rounded-full ${raises ? 'bg-red-400' : 'bg-accent'}`}
                  style={{ width: `${Math.max(6, (Math.abs(f.impact) / maxImpact) * 100)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
