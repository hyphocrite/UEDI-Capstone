import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, Gauge, ShieldCheck, Target, BrainCircuit } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { api } from '../lib/api'
import { scoreLine } from '../lib/applications'
import type { Benchmark, BenchmarkDataset, BenchmarkRow, ConfusionMatrix, ModelInfo } from '../lib/applications'
import { formatDate } from '../lib/format'

const pct = (x: number) => `${Math.round(x * 100)}%`
const short: Record<string, string> = { random_forest: 'RF', xgboost: 'XGB', linear_regression: 'LR', ridge: 'Ridge', decision_tree: 'DT' }
const memberNames: Record<string, string> = {
  random_forest: 'Random Forest', xgboost: 'XGBoost', linear_regression: 'Linear Regression', ridge: 'Ridge Regression', decision_tree: 'Decision Tree',
}
/** Benchmark names for stacks are long; show "Stacked (RF + XGB + LR)". plot_results.py keys the app's stack as ENSEMBLE. */
const ENSEMBLE = 'Stacked ensemble (app)'
const rowName = (r: BenchmarkRow) => (r.members ? `Stacked (${r.members.map((m) => short[m] ?? m).join(' + ')})` : r.model)
const matrixKey = (r: BenchmarkRow) => (r.usedByApp ? ENSEMBLE : r.model)

// R² bars run from 0 (no better than guessing the average) to the best model's R², rounded up.
const barWidth = (r2: number, max: number) => `${Math.max(0, Math.min(1, r2 / max)) * 100}%`

export default function CreditModelPage() {
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [bench, setBench] = useState<Benchmark | null>(null)
  const [benchError, setBenchError] = useState('')
  const [datasetKey, setDatasetKey] = useState<BenchmarkDataset['key']>('uedi_loans')
  const [selected, setSelected] = useState(ENSEMBLE)

  useEffect(() => {
    api<{ model: ModelInfo }>('/api/applications/model').then((r) => setModel(r.model)).catch(() => setModel(null))
    api<Benchmark>('/api/applications/model/benchmark')
      .then((b) => {
        setBench(b)
        if (b.datasets.length && !b.datasets.some((d) => d.key === 'uedi_loans')) setDatasetKey(b.datasets[0].key)
      })
      .catch((e: Error) => setBenchError(e.message))
  }, [])

  const dataset = bench?.datasets.find((d) => d.key === datasetKey)
  const errors = bench?.errorTypes?.models
  const rows = useMemo(() => [...(dataset?.results ?? [])].sort((a, b) => b.r2 - a.r2), [dataset])
  const maxR2 = Math.max(0.1, Math.ceil(Math.max(0, ...rows.map((r) => r.r2 + r.r2Sd)) * 10) / 10)

  const ens = model?.models?.ensemble
  const members = model?.members?.map((m) => memberNames[m] ?? m).join(' + ') ?? 'Random Forest + XGBoost + Ridge Regression'

  return (
    <>
      <PageHeader icon={BrainCircuit}
        title="Credit Model"
        subtitle="How the credit-score model behind Pending Applications was built and how it compares with the 8 regression algorithms."
      />

      {model?.sampleData && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          The model is trained on sample loans shaped like UDEI's form, rates and terms. UDEI's records so far (45 borrowers) are too few to train on; retrain once there are about 200 loans.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Gauge} label="Model in use" value="Stacked ensemble (regression)" hint={members} />
        <StatCard icon={Target} label="R² (cross-validated)" value={ens?.r2 != null ? ens.r2.toFixed(3) : '–'}
          hint={ens?.mae != null ? `MAE ${ens.mae.toFixed(2)} · RMSE ${ens.rmse.toFixed(2)} points · ${model?.validation}` : model?.validation} />
        <StatCard
          icon={ShieldCheck}
          label="Suggestion cut-offs"
          value={model?.thresholds ? `${scoreLine(model.thresholds.deny).toFixed(0)} / ${scoreLine(model.thresholds.approve).toFixed(0)}` : '–'}
          hint="Credit score: deny below / approve at or above"
        />
        <StatCard
          icon={Database}
          label="Trained on"
          value={model ? `${model.rows.toLocaleString()} past mutual assistance (loans)` : '–'}
          hint={model ? `${model.targetMean != null ? `average repayment score ${model.targetMean.toFixed(1)}, ` : ''}${formatDate(model.trainedAt)}` : 'ML service not reachable'}
        />
      </div>

      {model?.errorTypes && (
        <p className="mb-6 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          At the approve line, the model flagged {pct(model.errorTypes.recall)} of past poor repayers (real score below {model.errorTypes.poorRepaymentBelow}) for review or denial.
          Type I error (good repayer flagged): {pct(model.errorTypes.typeIRate)}. Type II error (poor repayer suggested for approval): {pct(model.errorTypes.typeIIRate)}.
        </p>
      )}

      {model && <ShapSummary items={model.globalImportance} />}

      <section className="card mb-6 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-800">Benchmark of 8 regressors and the stacked ensemble</h2>
            <p className="text-sm text-brand-600">
              {dataset
                ? `${dataset.rows.toLocaleString()} past mutual assistance (loans), average repayment score ${dataset.targetMean.toFixed(1)}. ${dataset.validation}. Ranked by R².`
                : 'R²: share of the variation in past repayment scores a model explains. MAE: average points off.'}
            </p>
          </div>
          {bench && bench.datasets.length > 1 && (
            <div className="inline-flex rounded-lg border border-brand-200 bg-white p-1" role="tablist" aria-label="Dataset">
              {bench.datasets.map((d) => (
                <button key={d.key} role="tab" aria-selected={datasetKey === d.key} onClick={() => setDatasetKey(d.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    datasetKey === d.key ? 'bg-brand-800 bg-grad-brand text-white' : 'text-brand-700 hover:bg-brand-50'
                  }`}>
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {benchError && (
          <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {benchError} In <code>ml-service</code>, run <code>python benchmark.py</code>, <code>python train.py</code> and <code>python plot_results.py</code>.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs font-semibold tracking-wide text-brand-600 uppercase">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">R²</th>
                  <th className="py-2 pr-3 text-right">MAE (points)</th>
                  <th className="py-2 text-right">RMSE (points)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isApp = !!r.usedByApp
                  return (
                    <tr key={r.model} onClick={() => setSelected(matrixKey(r))}
                      className={`cursor-pointer border-b border-brand-50 last:border-0 row-hover ${selected === matrixKey(r) ? 'bg-brand-50' : ''}`}>
                      <td className={`py-2.5 pr-3 whitespace-nowrap ${isApp ? 'font-semibold text-brand-800' : 'text-ink'}`}>
                        {rowName(r)}{isApp && <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800 uppercase">app</span>}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-40 rounded-full bg-brand-50" title={`${r.r2.toFixed(3)} ± ${r.r2Sd.toFixed(3)}`}>
                            <div className={`animate-grow-right h-2 rounded-full ${isApp ? 'bg-accent bg-grad-bar-x' : 'bg-brand-300'}`} style={{ width: barWidth(r.r2, maxR2), animationDelay: `${i * 80}ms` }} />
                          </div>
                          <span className="tabular-nums">{r.r2.toFixed(3)} <span className="text-xs text-brand-500">± {r.r2Sd.toFixed(3)}</span></span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{r.mae.toFixed(2)} <span className="text-xs text-brand-500">± {r.maeSd.toFixed(2)}</span></td>
                      <td className="py-2.5 text-right tabular-nums">{r.rmse.toFixed(2)} <span className="text-xs text-brand-500">± {r.rmseSd.toFixed(2)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-brand-500">
              Bars run from 0 (no better than guessing the average score) to {maxR2.toFixed(1)}. {errors && 'Select a row to see its Type I and Type II errors.'}
            </p>
          </div>
        )}
      </section>

      {errors?.[selected] && bench?.errorTypes && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-brand-800">Type I and Type II errors: {selected === ENSEMBLE ? 'stacked ensemble (app)' : selected}</h2>
          <p className="mb-4 text-sm text-brand-600">
            Every record was scored by a model that never saw it. Poor repayer: real score below {bench.errorTypes.poorRepaymentBelow}. Flagged: predicted score below the approve line ({bench.errorTypes.approveLine}).
          </p>
          <ConfusionGrid cm={errors[selected].matrix} />
        </section>
      )}
    </>
  )
}

function ConfusionGrid({ cm }: { cm: ConfusionMatrix }) {
  const [[tn, fp], [fn, tp]] = cm
  const good = tn + fp
  const bad = fn + tp
  const cell = (n: number, of: number, label: string, tone: 'right' | 'wrong') => (
    <div className={`rounded-lg p-4 ${tone === 'right' ? 'bg-brand-800 bg-grad-brand text-white' : 'bg-brand-50 text-ink'}`}>
      <p className="text-2xl font-bold tabular-nums">{n.toLocaleString()}</p>
      <p className={`text-sm ${tone === 'right' ? 'text-brand-100' : 'text-brand-600'}`}>{label}, {pct(n / Math.max(of, 1))} of {of === good ? 'good' : 'poor'} repayers</p>
    </div>
  )
  return (
    <div className="grid max-w-2xl grid-cols-[auto_1fr_1fr] items-stretch gap-2 text-sm">
      <span />
      <p className="px-1 font-semibold text-brand-700">Suggested approve</p>
      <p className="px-1 font-semibold text-brand-700">Flagged (review or deny)</p>
      <p className="self-center pr-2 font-semibold text-brand-700">Good repayer</p>
      {cell(tn, good, 'Correct', 'right')}
      {cell(fp, good, 'Type I error', 'wrong')}
      <p className="self-center pr-2 font-semibold text-brand-700">Poor repayer</p>
      {cell(fn, bad, 'Type II error', 'wrong')}
      {cell(tp, bad, 'Caught', 'right')}
    </div>
  )
}

/** SHAP summary: which factors move the stacked ensemble's credit scores most across all training loans. */
function ShapSummary({ items }: { items: ModelInfo['globalImportance'] }) {
  return (
    <section className="card mb-6 p-5" aria-labelledby="shap-summary">
      <h2 id="shap-summary" className="text-lg font-semibold text-brand-800">Which factors matter most overall (SHAP summary)</h2>
      <p className="text-sm text-brand-600">
        Average size of each factor's push on the credit score over the training records (mean |SHAP|, in score points). Longer bars matter more, either way.
      </p>
      {!items?.length ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This model was trained before the SHAP summary existed. Retrain it to see the chart: <code>npm run ml:train</code>.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((f, i) => (
            <li key={f.feature} className="grid grid-cols-1 items-center gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[16rem_1fr_3.5rem]">
              <span className="min-w-0 truncate text-ink" title={f.label}>{f.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-brand-50">
                <span className="animate-grow-right block h-full rounded-full bg-accent bg-grad-bar-x"
                  style={{ width: `${Math.max(2, (f.meanAbsShap / items[0].meanAbsShap) * 100)}%`, animationDelay: `${i * 40}ms` }} />
              </span>
              <span className="text-xs text-brand-600 tabular-nums sm:text-right">{f.meanAbsShap.toFixed(3)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
