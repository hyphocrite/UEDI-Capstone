// How a member pays their mutual assistance. Mirrors server/src/services/paymentModes.js.
export type PaymentMode = 'payroll' | 'bonus' | 'cash' | 'e_money' | 'bank_transfer'
export type BonusType = 'mid_year' | 'year_end' | 'cna' | 'sri'
export type BonusCalendar = Record<BonusType, { month: number; day: number }>

export const PAYMENT_MODES: { value: PaymentMode; label: string; hint: string }[] = [
  { value: 'payroll', label: 'Payroll deduction', hint: 'Deducted from your salary every cutoff. The usual way.' },
  { value: 'bonus', label: 'Bonus', hint: 'Paid in one go from a bonus: Mid-year, Year-end, CNA or SRI.' },
  { value: 'cash', label: 'Cash', hint: 'Paid at the UDEI office.' },
  { value: 'bank_transfer', label: 'Bank transfer', hint: "Sent to UDEI's bank account." },
]

/** E-money is a mode a loan can be changed to (GCash, Maya), not one on the paper form. */
export const ALL_MODES: { value: PaymentMode; label: string }[] = [
  ...PAYMENT_MODES.map(({ value, label }) => ({ value, label })),
  { value: 'e_money', label: 'E-money' },
]

export const BONUS_TYPES: { value: BonusType; label: string; short: string }[] = [
  { value: 'mid_year', label: 'Mid-year bonus', short: 'Mid-year' },
  { value: 'year_end', label: 'Year-end bonus', short: 'Year-end' },
  { value: 'cna', label: 'CNA (Collective Negotiation Agreement)', short: 'CNA' },
  { value: 'sri', label: 'SRI (Service Recognition Incentive)', short: 'SRI' },
]

export const modeLabel = (mode: PaymentMode | undefined, bonusType?: BonusType | null) =>
  mode === 'bonus'
    ? `Bonus: ${BONUS_TYPES.find((b) => b.value === bonusType)?.label ?? 'bonus'}`
    : ALL_MODES.find((m) => m.value === mode)?.label ?? 'Payroll deduction'

/** Same defaults as the server (UDEI to confirm). */
export const FALLBACK_BONUS_CALENDAR: BonusCalendar = {
  mid_year: { month: 5, day: 15 },
  year_end: { month: 11, day: 15 },
  cna: { month: 12, day: 15 },
  sri: { month: 12, day: 20 },
}

/** The first release of the bonus at least `minDays` after `from` (YYYY-MM-DD), as YYYY-MM-DD. Same rule as the server. */
export function nextBonusDate(calendar: BonusCalendar, bonusType: BonusType, from: string, minDays = 10): string {
  const c = calendar[bonusType]
  const start = new Date(`${from}T00:00:00Z`).getTime() + minDays * 86_400_000
  for (let y = new Date(start - minDays * 86_400_000).getUTCFullYear(); ; y++) {
    const last = new Date(Date.UTC(y, c.month, 0)).getUTCDate()
    const d = new Date(Date.UTC(y, c.month - 1, Math.min(c.day, last)))
    if (d.getTime() >= start) return d.toISOString().slice(0, 10)
  }
}

/** Whole months from a to b (YYYY-MM-DD), a part month counting as one, at least 1. Same as the server. */
export function monthsBetween(a: string, b: string): number {
  const x = new Date(`${a}T00:00:00Z`)
  const y = new Date(`${b}T00:00:00Z`)
  let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth())
  if (y.getUTCDate() > x.getUTCDate()) m += 1
  return Math.max(1, m)
}

/** One entry of a loan's payment mode history. */
export type PaymentModeChange = {
  mode: PaymentMode
  bonusType?: BonusType | null
  effectiveFrom: string
  requestedByName?: string
  requestedAt?: string
  note?: string | null
}
