// How a member pays their mutual assistance. Kept in step with client/src/lib/paymentModes.ts and
// server/src/services/paymentModes.js.
export type PaymentMode = 'payroll' | 'bonus' | 'cash' | 'e_money' | 'bank_transfer'
export type BonusType = 'mid_year' | 'year_end' | 'cna' | 'sri'
export type BonusCalendar = Record<BonusType, { month: number; day: number }>

// The one wording for "Mode of payment" (the panel at the final defense): the same words as the web
// and the server. The field is always called "Mode of payment".
export const MODE_LABEL: Record<PaymentMode, string> = {
  payroll: 'Salary deduction',
  bonus: 'Charge to bonus',
  cash: 'Cash (over the counter)',
  e_money: 'E-wallet (GCash / Maya)',
  bank_transfer: 'Bank deposit / transfer',
}
export const MODE_HINT: Record<PaymentMode, string> = {
  payroll: 'Deducted monthly from your DNSC salary.',
  bonus: 'Paid in full from one bonus.',
  cash: 'Paid at the UDEI office; the Treasurer issues an OR.',
  e_money: "Sent to UDEI's GCash or Maya; attach the receipt.",
  bank_transfer: "Deposited or transferred to UDEI's bank account.",
}

const option = <V extends PaymentMode>(value: V) => ({ value, label: MODE_LABEL[value], hint: MODE_HINT[value] })

/** The four on UDEI's paper application form, in its order. */
export const MODE_OPTIONS = (['payroll', 'bonus', 'cash', 'bank_transfer'] as const).map(option)
/** A loan's mode can also be changed to an e-wallet. */
export const CHANGE_OPTIONS = [...MODE_OPTIONS, option('e_money')]
/** How a member can send a payment outside payroll. */
export const SEND_OPTIONS = (['e_money', 'bank_transfer', 'cash'] as const).map(option)

/** label: the big name on the choice; name: in "Charge to …"; hint: the small line. */
export const BONUS_OPTIONS: { value: BonusType; label: string; name: string; hint: string }[] = [
  { value: 'mid_year', label: 'Mid-Year', name: 'Mid-Year Bonus', hint: 'Mid-Year Bonus' },
  { value: 'year_end', label: 'Year-End', name: 'Year-End Bonus', hint: 'Year-End Bonus' },
  { value: 'cna', label: 'CNA', name: 'CNA Incentive', hint: 'Collective Negotiation Agreement Incentive' },
  { value: 'sri', label: 'SRI', name: 'SRI', hint: 'Service Recognition Incentive' },
]

/** "Salary deduction", or "Charge to Year-End Bonus". */
export const modeLabel = (mode?: string | null, bonusType?: string | null) => {
  if (mode === 'bonus') {
    const b = BONUS_OPTIONS.find((x) => x.value === bonusType)
    return b ? `Charge to ${b.name}` : MODE_LABEL.bonus
  }
  return MODE_LABEL[(mode ?? 'payroll') as PaymentMode] ?? MODE_LABEL.payroll
}

/** How one payment came in, in the same words. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  payroll: MODE_LABEL.payroll,
  cash: MODE_LABEL.cash,
  e_money: MODE_LABEL.e_money,
  bank_transfer: MODE_LABEL.bank_transfer,
  other: 'Adjustment',
  offset: 'Offset from new release',
}

/** How often payroll deducts ("quincenal" is only the stored value). For choices and labels. */
export const FREQUENCY_LABEL: Record<'quincenal' | 'monthly', string> = {
  quincenal: 'Twice a month (15th and month-end)',
  monthly: 'Monthly (month-end)',
}
/** The same in a sentence: "12 months, twice a month (15th and month-end)". */
export const frequencyLabel = (f: string | undefined | null) => (f === 'quincenal' ? 'twice a month (15th and month-end)' : 'monthly (month-end)')

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
