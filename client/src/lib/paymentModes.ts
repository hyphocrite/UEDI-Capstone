// How a member pays their mutual assistance. Mirrors server/src/services/paymentModes.js.
export type PaymentMode = 'payroll' | 'bonus' | 'cash' | 'e_money' | 'bank_transfer'
export type BonusType = 'mid_year' | 'year_end' | 'cna' | 'sri'
export type BonusCalendar = Record<BonusType, { month: number; day: number }>

// The one wording for "Mode of payment" on the web: forms, lists, the loan page, the Statement and
// the printed form all read their labels from here (the panel's request at the final defense).
// The field is always called "Mode of payment". The server (services/paymentModes.js) and the app
// (mobile/src/paymentModes.ts) use the same words.

/** The label in lists, tables, exports and print. */
export const MODE_LABEL: Record<PaymentMode, string> = {
  payroll: 'Salary deduction',
  bonus: 'Charge to bonus',
  cash: 'Cash (over the counter)',
  e_money: 'E-wallet (GCash / Maya)',
  bank_transfer: 'Bank deposit / transfer',
}

/** The short line under each choice card. */
export const MODE_HINT: Record<PaymentMode, string> = {
  payroll: 'Deducted monthly from your DNSC salary.',
  bonus: 'Paid in full from one bonus.',
  cash: 'Paid at the UDEI office; the Treasurer issues an OR.',
  e_money: "Sent to UDEI's GCash or Maya; attach the receipt.",
  bank_transfer: "Deposited or transferred to UDEI's bank account.",
}

/** A label without its bracket part, for narrow table cells: "Cash", "E-wallet". Put the full label in title="". */
export const shortLabel = (label: string) => label.replace(/\s*\(.*\)$/, '')

const choice = (value: PaymentMode) => ({ value, label: MODE_LABEL[value], hint: MODE_HINT[value] })

/** The four on UDEI's paper application form, in its order. */
export const PAYMENT_MODES: { value: PaymentMode; label: string; hint: string }[] = (['payroll', 'bonus', 'cash', 'bank_transfer'] as const).map(choice)

/** A loan can also be changed to an e-wallet, which is not on the paper form. */
export const ALL_MODES: { value: PaymentMode; label: string; hint: string }[] = [...PAYMENT_MODES, choice('e_money')]

/** short: the big name on the choice card; label: in "Charge to …"; long: the small line under it. */
export const BONUS_TYPES: { value: BonusType; label: string; short: string; long: string }[] = [
  { value: 'mid_year', label: 'Mid-Year Bonus', short: 'Mid-Year', long: 'Mid-Year Bonus' },
  { value: 'year_end', label: 'Year-End Bonus', short: 'Year-End', long: 'Year-End Bonus' },
  { value: 'cna', label: 'CNA Incentive', short: 'CNA', long: 'Collective Negotiation Agreement Incentive' },
  { value: 'sri', label: 'SRI', short: 'SRI', long: 'Service Recognition Incentive' },
]

export const bonusLabel = (bonusType?: BonusType | null) => BONUS_TYPES.find((b) => b.value === bonusType)?.label ?? 'bonus'

/** "Salary deduction", or "Charge to Year-End Bonus". No mode on file means salary deduction. */
export const modeLabel = (mode: PaymentMode | undefined | null, bonusType?: BonusType | null) =>
  mode === 'bonus' ? (bonusType ? `Charge to ${bonusLabel(bonusType)}` : MODE_LABEL.bonus) : MODE_LABEL[mode ?? 'payroll'] ?? MODE_LABEL.payroll

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

/** One entry of a loan's mode of payment history. */
export type PaymentModeChange = {
  mode: PaymentMode
  bonusType?: BonusType | null
  effectiveFrom: string
  requestedByName?: string
  requestedAt?: string
  note?: string | null
}
