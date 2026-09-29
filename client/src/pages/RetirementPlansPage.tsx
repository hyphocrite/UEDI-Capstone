import { useMemo, useState } from 'react'
import { CalendarDays, CircleCheck, Clock, PiggyBank, Wallet } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import { memberName, planBalance, planMonthsLeft, retirementPlans } from '../data/mock'
import type { RetirementPlan } from '../data/mock'
import { formatDate, formatPeso, percent } from '../lib/format'

function addMonths(iso: string, n: number) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export default function RetirementPlansPage() {
  const [selectedId, setSelectedId] = useState(retirementPlans[0].id)
  const selected = retirementPlans.find((p) => p.id === selectedId) ?? retirementPlans[0]

  const totals = useMemo(() => {
    const contract = retirementPlans.reduce((s, p) => s + p.contractAmount, 0)
    const paid = retirementPlans.reduce((s, p) => s + p.amountPaid, 0)
    return { contract, paid, remaining: contract - paid }
  }, [])

  return (
    <>
      <PageHeader
        title="Retirement Plans"
        subtitle="Each member's plan and how much they still have to pay."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={PiggyBank} label="Plans enrolled" value={String(retirementPlans.length)} />
        <StatCard icon={Wallet} label="Total still to pay" value={formatPeso(totals.remaining)} hint={`of ${formatPeso(totals.contract)} in contracts`} />
        <StatCard icon={Clock} label="Behind on payments" value={String(retirementPlans.filter((p) => p.status === 'Behind').length)} />
        <StatCard icon={CircleCheck} label="Completed" value={String(retirementPlans.filter((p) => p.status === 'Completed').length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="border-b border-brand-100 p-4">
            <h2 className="font-semibold text-brand-800">All plans</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Left to pay</th>
                  <th className="w-40 px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {retirementPlans.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`cursor-pointer ${p.id === selected.id ? 'bg-brand-50' : 'hover:bg-brand-50/50'}`}
                  >
                    <td className="px-4 py-3">
                      <button className="text-left" onClick={() => setSelectedId(p.id)}>
                        <p className="font-semibold text-ink">{memberName(p.memberId)}</p>
                        <p className="text-xs text-brand-500">{p.id}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3">{p.planName}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatPeso(planBalance(p))}</td>
                    <td className="px-4 py-3"><ProgressBar value={percent(p.amountPaid, p.contractAmount)} label={`${p.id} paid`} /></td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <PlanDetail plan={selected} />
      </div>
    </>
  )
}

function PlanDetail({ plan }: { plan: RetirementPlan }) {
  const remaining = planBalance(plan)
  const monthsLeft = planMonthsLeft(plan)
  const schedule = plan.nextDueDate
    ? Array.from({ length: Math.min(6, monthsLeft) }, (_, i) => ({
        date: addMonths(plan.nextDueDate!, i),
        amount: Math.min(plan.monthlyDue, remaining - i * plan.monthlyDue),
      }))
    : []
  const finishDate = plan.nextDueDate && monthsLeft > 0 ? addMonths(plan.nextDueDate, monthsLeft - 1) : null

  return (
    <aside className="card h-fit p-6">
      <p className="text-xs font-semibold tracking-wide text-brand-500 uppercase">{plan.id}</p>
      <h2 className="mt-1 text-lg font-bold text-brand-800">{memberName(plan.memberId)}</h2>
      <p className="text-sm text-brand-600">{plan.planName}</p>

      <div className="mt-5 rounded-xl bg-[#0B422A] p-5 text-white">
        <p className="text-sm text-brand-200">Remaining to pay</p>
        <p className="mt-1 text-3xl font-bold">{formatPeso(remaining)}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent(plan.amountPaid, plan.contractAmount)}%` }} />
        </div>
        <p className="mt-2 text-xs text-brand-200">
          {formatPeso(plan.amountPaid)} paid of {formatPeso(plan.contractAmount)}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-brand-500">Monthly due</dt>
          <dd className="font-semibold">{formatPeso(plan.monthlyDue)}</dd>
        </div>
        <div>
          <dt className="text-brand-500">Months left</dt>
          <dd className="font-semibold">{monthsLeft}</dd>
        </div>
        <div>
          <dt className="text-brand-500">Started</dt>
          <dd className="font-semibold">{formatDate(plan.startDate)}</dd>
        </div>
        <div>
          <dt className="text-brand-500">Expected to finish</dt>
          <dd className="font-semibold">{finishDate ? formatDate(finishDate) : 'Completed'}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <CalendarDays className="h-4 w-4" /> Upcoming payments
        </h3>
        {schedule.length === 0 ? (
          <p className="mt-2 text-sm text-brand-500">This plan is fully paid.</p>
        ) : (
          <ul className="mt-2 divide-y divide-brand-50 text-sm">
            {schedule.map((s) => (
              <li key={s.date} className="flex justify-between py-2">
                <span>{formatDate(s.date)}</span>
                <span className="font-medium">{formatPeso(s.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
