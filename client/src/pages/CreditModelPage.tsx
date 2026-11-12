import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, Gauge, ShieldCheck, Target } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { api } from '../lib/api'
import type { Benchmark, BenchmarkDataset, ConfusionMatrix, ModelInfo } from '../lib/applications'
import { formatDate } from '../lib/format'

const ENSEMBLE = 'Stacked ensemble (app)'
const shortName = (m: string) => (m === ENSEMBLE ? 'Stacked ensemble' : m)
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Recall, precision and F1 from a confusion matrix: [[good passed, good flagged], [bad missed, bad caught]]. */
function fromMatrix([[, fp], [fn, tp]]: ConfusionMatrix) {
  return { recall: tp / (tp + fn), precision: tp + fp ? tp / (tp + fp) : 0, f1: (2 * tp) / (2 * tp + fp + fn) }
}

// AUC bars run from 0.5 (guessing) to 0.9.
const AUC_MIN = 0.5
const AUC_MAX = 0.9
const barWidth = (auc: number) => `${Math.max(0, Math.min(1, (auc - AUC_MIN) / (AUC_MAX - AUC_MIN))) * 100}%`

export default function CreditModelPage() {
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [bench, setBench] = useState<Benchmark | null>(null)
  const [benchError, setBenchError] = useState('')
  const [datasetKey, setDatasetKey] = useState<BenchmarkDataset['key']>('german_credit')
  const [selected, setSelected] = useState(ENSEMBLE)

  useEffect(() => {
    api<{ model: ModelInfo }>('/api/applications/model').then((r) => setModel(r.model)).catch(() => setModel(null))
    api<Benchmark>('/api/applications/model/benchmark')
      .then((b) => {
        setBench(b)
        if (b.datasets.length && !b.datasets.some((d) => d.key === 'german_credit')) setDatasetKey(b.datasets[0].key)
      })
      .catch((e: Error) => setBenchError(e.message))
  }, [])

  const dataset = bench?.datasets.find((d) => d.key === datasetKey)
  const matrices = bench?.confusion?.matrices[datasetKey]
  const rows = useMemo(
    () =>
      [...(dataset?.results ?? [])]
        .sort((a, b) => b.aucRoc - a.aucRoc)
        .map((r) => ({ ...r, ...(matrices?.[r.model] ? fromMatrix(matrices[r.model]) : {}) })),
    [dataset, matrices],
  )

  const ens = model?.models?.ensemble

  return (
    <>
      <PageHeader
        title="Credit Model"
        subtitle="How the loan-risk model behind Pending Loans was built and how it compares with 8 other classifiers."
      />

      {model?.sampleData && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          The model is trained on sample loans shaped like UEDI's form, rates and terms. UEDI's records so far (45 borrowers) are too few to train on; retrain once there are about 200 loans.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Gauge} label="Model in use" value="Stacked ensemble" hint="XGBoost + Random Forest + Logistic Regression" />
        <StatCard icon={Target} label="AUC-ROC (cross-validated)" value={ens ? ens.aucRoc.toFixed(3) : '–'} hint={model?.validation} />
        <StatCard
          icon={ShieldCheck}
          label="Suggestion cut-offs"
          value={model?.thresholds ? `${pct(model.thresholds.approve)} / ${pct(model.thresholds.deny)}` : '–'}
          hint="Approve below / deny from, chance of default"
        />
        <StatCard
          icon={Database}
          label="Trained on"
          value={model ? `${model.rows.toLocaleString()} loans` : '–'}
          hint={model ? `${pct(model.defaultRate)} bad, ${formatDate(model.trainedAt)}` : 'ML service not reachable'}
        />
      </div>

      <section className="card mb-6 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-800">Benchmark of 9 models</h2>
            <p className="text-sm text-brand-600">
              {dataset ? `${dataset.rows.toLocaleString()} loans, ${dataset.bad.toLocaleString()} bad. ${dataset.validation}, class weights.` : 'AUC-ROC: how well a model ranks bad loans above good ones.'}
            </p>
          </div>
          {bench && bench.datasets.length > 1 && (
            <div className="inline-flex rounded-lg border border-brand-200 bg-white p-1" role="tablist" aria-label="Dataset">
              {bench.datasets.map((d) => (
                <button key={d.key} role="tab" aria-selected={datasetKey === d.key} onClick={() => setDatasetKey(d.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    datasetKey === d.key ? 'bg-brand-800 text-white' : 'text-brand-700 hover:bg-brand-50'
                  }`}>
                  {d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {benchError && (
          <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
            {benchError} In <code>ml-service</code>, run <code>python benchmark.py --german --balance weights</code>,{' '}
            <code>python benchmark.py --data data/sample_loans.csv --balance weights</code> and <code>python plot_results.py</code>.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs font-semibold tracking-wide text-brand-600 uppercase">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">AUC-ROC</th>
                  <th className="py-2 pr-3 text-right">Bad loans caught</th>
                  <th className="py-2 pr-3 text-right">Flags correct</th>
                  <th className="py-2 text-right">F1</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEns = r.model === ENSEMBLE
                  return (
                    <tr key={r.model} onClick={() => setSelected(r.model)}
                      className={`cursor-pointer border-b border-brand-50 last:border-0 hover:bg-brand-50/60 ${selected === r.model ? 'bg-brand-50' : ''}`}>
                      <td className={`py-2.5 pr-3 whitespace-nowrap ${isEns ? 'font-semibold text-brand-800' : 'text-ink'}`}>{shortName(r.model)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-40 rounded-full bg-brand-50" title={`${r.aucRoc.toFixed(3)} ± ${r.aucRocSd.toFixed(3)}`}>
                            <div className={`h-2 rounded-full ${isEns ? 'bg-accent' : 'bg-brand-300'}`} style={{ width: barWidth(r.aucRoc) }} />
                          </div>
                          <span className="tabular-nums">{r.aucRoc.toFixed(3)} <span className="text-xs text-brand-500">± {r.aucRocSd.toFixed(3)}</span></span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.recall)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.precision)}</td>
                      <td className="py-2.5 text-right tabular-nums">{r.f1.toFixed(3)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-brand-500">
              Bars run from 0.5 (guessing) to 0.9. Select a row to see its confusion matrix.
              {matrices && ' Caught and correct come from out-of-fold predictions; the ensemble flags a loan above the dataset’s bad-loan rate, the others at 50%.'}
            </p>
          </div>
        )}
      </section>

      {matrices?.[selected] && dataset && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-brand-800">Confusion matrix: {shortName(selected)}</h2>
          <p className="mb-4 text-sm text-brand-600">{dataset.name}. Every loan was scored by a model that never saw it.</p>
          <ConfusionGrid cm={matrices[selected]} />
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
    <div className={`rounded-lg p-4 ${tone === 'right' ? 'bg-brand-800 text-white' : 'bg-brand-50 text-ink'}`}>
      <p className="text-2xl font-bold tabular-nums">{n.toLocaleString()}</p>
      <p className={`text-sm ${tone === 'right' ? 'text-brand-100' : 'text-brand-600'}`}>{label}, {pct(n / of)} of {of === good ? 'good' : 'bad'} loans</p>
    </div>
  )
  return (
    <div className="grid max-w-2xl grid-cols-[auto_1fr_1fr] items-stretch gap-2 text-sm">
      <span />
      <p className="px-1 font-semibold text-brand-700">Predicted good</p>
      <p className="px-1 font-semibold text-brand-700">Predicted bad</p>
      <p className="self-center pr-2 font-semibold text-brand-700">Actually good</p>
      {cell(tn, good, 'Passed', 'right')}
      {cell(fp, good, 'Flagged for review', 'wrong')}
      <p className="self-center pr-2 font-semibold text-brand-700">Actually bad</p>
      {cell(fn, bad, 'Missed', 'wrong')}
      {cell(tp, bad, 'Caught', 'right')}
    </div>
  )
}
