import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Gauge, House, Link2Off, Lightbulb } from 'lucide-react'
import EmptyState from '../EmptyState'
import ScoreParts from './ScoreParts'
import { bandLabel, bandStyle } from '../../lib/members'
import type { MemberScoreView } from '../../lib/members'
import type { MyScoreState } from '../../lib/useMyScore'

/** Shown instead of a weak-looking number when there isn't enough on record yet. */
const limited = (s: MemberScoreView) => s.band === 'limited' || s.score === null

/** The score in large type with its band, a coverage bar and, optionally, how it's computed. */
function ScoreFigure({ score, compact }: { score: MemberScoreView; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {limited(score) ? (
          <p className={`font-bold text-brand-800 ${compact ? 'text-xl' : 'text-2xl'}`}>Not enough records yet</p>
        ) : (
          <p className={`font-bold text-brand-800 tabular-nums ${compact ? 'text-4xl' : 'text-6xl'}`}>
            {score.score}<span className="ml-1 text-base font-medium text-brand-500">/ 100</span>
          </p>
        )}
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bandStyle[score.band]}`}>{bandLabel[score.band]}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-valuenow={Math.round(score.coverage * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="How much of the possible data the score is based on">
        <div className="animate-grow-right h-full rounded-full bg-accent bg-grad-bar-x" style={{ width: `${Math.round(score.coverage * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-brand-500">Based on {Math.round(score.coverage * 100)}% of the possible data</p>
    </div>
  )
}

/**
 * The member's own member score (savings, attendance, bills, co-maker record, repayment), on Home
 * and, compact, on Profile. Never the ML credit score of an application.
 */
export default function MyScoreCard({ state, compact = false }: { state: MyScoreState; compact?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="card min-w-0 p-5" aria-labelledby="my-score">
      <h2 id="my-score" className="flex items-center gap-2 font-semibold text-brand-800"><Gauge className="h-4 w-4 text-accent-dark" /> Your member score</h2>
      {state.status === 'loading' && <p className="py-6 text-sm text-brand-500">Loading your score…</p>}
      {state.status === 'error' && <EmptyState icon={Gauge} title="Your score could not be loaded." hint={state.message} className="py-6" />}
      {state.status === 'ok' && !state.data.linked && (
        <EmptyState icon={Link2Off} title="Not linked to your member record yet." hint="The UDEI office links your account to your member number. Your score shows here after that." className="py-6" />
      )}
      {state.status === 'ok' && state.data.linked && (
        <div className="mt-3">
          <ScoreFigure score={state.data.score} compact={compact} />
          {compact ? (
            <>
              {state.data.score.tips[0] && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> {state.data.score.tips[0]}
                </p>
              )}
              <Link to="/home" className="btn-ghost mt-3 px-3 py-1.5 text-sm"><House className="h-4 w-4" /> See it on Home</Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-brand-600">
                This score is from your savings, attendance, bills, co-maker record and repayment. It is not the credit score the signers see on an application.
              </p>
              <button type="button" className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                See how it's computed <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="mt-3 rounded-lg bg-brand-50/60 p-3">
                  <ScoreParts parts={state.data.score.parts} />
                  <p className="mt-2 text-xs text-brand-500">Parts with no data are left out instead of counting against you.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
