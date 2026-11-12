const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

/** Application amounts are in pesos. */
export const pesos = (n: number) => peso.format(n)

/** Loan amounts from the API are integer centavos. */
export const centavos = (n: number) => peso.format(n / 100)

export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : '—'

export const LOAN_TYPE_LABEL: Record<string, string> = { long_term: 'Long term', emergency: 'Emergency' }

export const daysUntil = (d: string | Date) => {
  const ms = new Date(d).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}
