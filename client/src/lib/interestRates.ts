import { interestRates as defaults } from '../data/mock'
import type { InterestRate } from '../data/mock'

export const RATES_STORAGE_KEY = 'uedi.interestRates'

/** Rates saved on the Settings page, or the defaults. */
export function loadRates(): InterestRate[] {
  try {
    const saved = localStorage.getItem(RATES_STORAGE_KEY)
    if (saved) return JSON.parse(saved) as InterestRate[]
  } catch {
    /* ignore unreadable storage */
  }
  return defaults
}
