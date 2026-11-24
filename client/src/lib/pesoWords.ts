// An amount written out in words, as on a printed form: "Twenty-Five Thousand Pesos Only".

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion']

/** 0–999 in words ('' for 0). */
function hundreds(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const tens = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`
  return [h ? `${ONES[h]} Hundred` : '', tens].filter(Boolean).join(' ')
}

/** A whole number in words, "Zero" for 0. */
export function numberWords(n: number): string {
  let whole = Math.floor(Math.abs(n))
  if (whole === 0) return 'Zero'
  const parts: string[] = []
  for (let i = 0; whole > 0 && i < SCALES.length; i++) {
    const chunk = whole % 1000
    if (chunk) parts.unshift([hundreds(chunk), SCALES[i]].filter(Boolean).join(' '))
    whole = Math.floor(whole / 1000)
  }
  return parts.join(' ')
}

/** Pesos in words, with centavos as a fraction: "One Thousand Pesos and 50/100 Only". */
export function pesoWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return ''
  const cents = Math.round(amount * 100)
  const pesos = Math.floor(cents / 100)
  const rest = cents % 100
  const unit = pesos === 1 ? 'Peso' : 'Pesos'
  return `${numberWords(pesos)} ${unit}${rest ? ` and ${String(rest).padStart(2, '0')}/100` : ''} Only`
}
