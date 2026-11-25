// How a member pays their mutual assistance. Kept in step with client/src/lib/paymentModes.ts and
// server/src/services/paymentModes.js.
export type PaymentMode = 'payroll' | 'bonus' | 'cash' | 'e_money' | 'bank_transfer'
export type BonusType = 'mid_year' | 'year_end' | 'cna' | 'sri'
export type BonusCalendar = Record<BonusType, { month: number; day: number }>

export const MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: 'payroll', label: 'Payroll deduction' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
]
export const CHANGE_OPTIONS: { value: PaymentMode; label: string }[] = [...MODE_OPTIONS, { value: 'e_money', label: 'E-money' }]

export const BONUS_OPTIONS: { value: BonusType; label: string; long: string }[] = [
  { value: 'mid_year', label: 'Mid-year', long: 'Mid-year bonus' },
  { value: 'year_end', label: 'Year-end', long: 'Year-end bonus' },
  { value: 'cna', label: 'CNA', long: 'CNA (Collective Negotiation Agreement)' },
  { value: 'sri', label: 'SRI', long: 'SRI (Service Recognition Incentive)' },
]

export const modeLabel = (mode?: string | null, bonusType?: string | null) =>
  mode === 'bonus' ? `Bonus: ${BONUS_OPTIONS.find((b) => b.value === bonusType)?.long ?? 'bonus'}` : CHANGE_OPTIONS.find((m) => m.value === mode)?.label ?? 'Payroll deduction'

/** Same defaults as the server (UDEI to confirm). */
export const FALLBACK_BONUS_CALENDAR: BonusCalendar = {
  mid_year: { month: 5, day: 15 },
  year_end: { month: 11, day: 15 },
  cna: { month: 12, day: 15 },
  sri: { month: 12, day: 20 },
}

const DAY = 86_400_000
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()

/** The first release of the bonus at least 10 days after `from` (YYYY-MM-DD), as YYYY-MM-DD. */
export function nextBonusDate(calendar: BonusCalendar, bonusType: BonusType, from: string): string {
  const c = calendar[bonusType]
  const earliest = utc(from) + 10 * DAY
  for (let y = new Date(utc(from)).getUTCFullYear(); ; y++) {
    const last = new Date(Date.UTC(y, c.month, 0)).getUTCDate()
    const d = new Date(Date.UTC(y, c.month - 1, Math.min(c.day, last)))
    if (d.getTime() >= earliest) return d.toISOString().slice(0, 10)
  }
}

/** Whole months from a to b, a part month counting as one (at least 1). */
export function monthsBetween(a: string, b: string): number {
  const x = new Date(utc(a))
  const y = new Date(utc(b))
  let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth())
  if (y.getUTCDate() > x.getUTCDate()) m += 1
  return Math.max(1, m)
}
