import { creditScore } from '../../lib/applications'
import type { ModelScore } from '../../lib/applications'
import SuggestionBadge from './SuggestionBadge'

const blurb: Record<ModelScore['key'], string> = {
  xgboost: 'Boosted regression trees. Strong at spotting combinations of factors.',
  random_forest: 'Many regression trees averaged together. Stable and hard to fool with one odd value.',
  linear_regression: 'A weighted sum of factors. The easiest to explain line by line.',
  ridge: 'A weighted sum of factors, with the weights kept small so no single factor dominates.',
  decision_tree: 'One tree of yes/no questions. Easy to follow, less precise.',
  logistic_regression: 'A weighted sum of factors (older classification model).',
}

/** Yes/no factors read better with their value, e.g. "Informal work: no". */
function factorLabel(f: ModelScore['topFactors'][number]) {
  const yesNo = ['loan_type_emergency', 'employment_not_permanent'].includes(f.feature)
  return yesNo ? `${f.label}: ${f.value ? 'yes' : 'no'}` : f.label
}

export default function ModelCard({ model }: { model: ModelScore }) {
  const maxImpact = Math.max(...model.topFactors.map((f) => Math.abs(f.impact)), 1e-6)
  return (
    <article className="card card-hover flex flex-col p-4" aria-label={`${model.name} result`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-brand-800">{model.name}</h3>
          <p className="mt-0.5 text-xs text-brand-500">{blurb[model.key]}</p>
        </div>
        <SuggestionBadge suggestion={model.suggestion} />
      </div>

      <p className="mt-3 text-3xl font-bold text-ink">
        {creditScore(model).toFixed(2)}
        <span className="ml-1 text-sm font-medium text-brand-500">/ 100 credit score</span>
      </p>
      {model.cvMetrics && (
        <p className="text-xs text-brand-500">
          {model.cvMetrics.r2 != null
            ? `Tested: R² ${model.cvMetrics.r2.toFixed(2)} · about ${model.cvMetrics.mae.toFixed(1)} points off on average`
            : 'Scored by the older classification model'}
        </p>
      )}

      <h4 className="mt-4 text-xs font-semibold tracking-wide text-brand-600 uppercase">Biggest factors</h4>
      <ul className="mt-2 space-y-2">
        {model.topFactors.map((f, i) => {
          // Regression factors (direction "raises score"/"lowers score") push the score; older
          // classifier factors pushed the chance of default, the other way round.
          const raises = f.direction?.endsWith('score') ? f.impact < 0 : f.impact > 0
          return (
            <li key={f.feature} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-ink">{factorLabel(f)}</span>
                <span className={raises ? 'text-red-700' : 'text-emerald-700'}>{raises ? 'lowers score' : 'raises score'}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-50">
                <div
                  className={`animate-grow-right h-full rounded-full ${raises ? 'bg-red-400' : 'bg-accent'}`}
                  style={{ width: `${Math.max(6, (Math.abs(f.impact) / maxImpact) * 100)}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
