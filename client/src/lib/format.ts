const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

// Money: formatPeso (whole pesos, "₱5,000") only for amounts a person picks on a form (requested
// amount, salary, the amount choices). Anything from the ledger, balances, installments, payments
// and reports uses formatCentavos in lib/loans.ts ("₱5,000.00").
export const formatPeso = (n: number) => peso.format(n)

const peso2 = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A worked-out amount in pesos (installment, interest, net pay left) with centavos: "₱2,837.48". */
export const formatAmount = (pesos: number) => peso2.format(Math.round(pesos * 100) / 100)

// Dates: one look everywhere, "Nov 27, 2026", and "Nov 27, 2026, 1:20 PM" with the time, always in
// UDEI's office time (Manila), so every device shows the same. Calendar dates stored as UTC
// midnight (due dates, cutoffs) use formatDay in lib/loans.ts, which gives the same look.
const MANILA = 'Asia/Manila'

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: MANILA })

/** "Nov 27, 2026, 1:20 PM" in Manila time; `seconds` for the Audit Log ("1:20:33 PM"). */
export const formatDateTime = (iso: string, opts: { seconds?: boolean } = {}) =>
  new Date(iso).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(opts.seconds ? { second: '2-digit' } : {}),
    timeZone: MANILA,
  })

/** Counts: "1,200". */
export const formatCount = (n: number) => n.toLocaleString('en-PH')

export const percent =(part: number, whole: number) =>
  whole <= 0 ? 0 : Math.min(100, Math.round((part / whole) * 100))
