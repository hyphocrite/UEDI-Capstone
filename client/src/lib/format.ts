const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

export const formatPeso = (n: number) => peso.format(n)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const percent =(part: number, whole: number) =>
  whole <= 0 ? 0 : Math.min(100, Math.round((part / whole) * 100))
