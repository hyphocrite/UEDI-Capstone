// Same formats as the web (client/src/lib/format.ts): whole pesos only for amounts picked on a
// form; centavos for anything worked out or from the ledger; dates as "Nov 27, 2026" in Manila time.
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const wholePeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })

/** An amount picked on a form (requested amount, salary, limits), in whole pesos: "₱5,000". */
export const pesos = (n: number) => wholePeso.format(n)

/** A worked-out amount in pesos (installment, interest): "₱2,837.48". */
export const amount = (n: number) => peso.format(Math.round(n * 100) / 100)

/** Loan amounts from the API are integer centavos: "₱5,000.00". */
export const centavos = (n: number) => peso.format(n / 100)

/** "Nov 27, 2026", the web's formatDate / formatDay. */
export const date = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : '—'

/** "Nov 27, 2026, 1:20 PM" in Manila time, the web's formatDateTime. */
export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—'

export const LOAN_TYPE_LABEL: Record<string, string> = { long_term: 'Long term', emergency: 'Short term (Emergency)' }

export const daysUntil = (d: string | Date) => {
  const ms = new Date(d).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}
