import { useEffect, useState } from 'react'
import { api } from './api'
import type { LoanType } from './applications'
import { FALLBACK_BONUS_CALENDAR } from './paymentModes'
import type { BonusCalendar } from './paymentModes'

export type LoanProduct = { label: string; monthlyRate: number; maxTermMonths: number }

/** UDEI's loan rules from the Settings page (GET /api/settings). */
export type LoanSettings = {
  products: Record<LoanType, LoanProduct>
  minMonthlySalary: number
  branches: string[]
  /** No longer enforced: a member's co-maker is optional, and signers ask for one case by case. */
  coMakersRequired: number
  /** Pending Loans suggests a co-maker for members' loans of this amount (pesos) or more. 0: never. */
  coMakersFromAmount: number
  /** Applicants not linked to a UDEI member number borrow at most this (pesos), with a member as co-maker. 0: no limit. */
  nonMemberMaxAmount: number
  /** Expected bonus release dates. UDEI to confirm. */
  bonusCalendar: BonusCalendar
  /** Mode changes on or before this day start this month; later, next month. */
  modeChangeCutoffDay: number
  shortTermGraceDays: number
  conversionTermMonths: number
  serviceFee: { rate: number; appliesTo: string[] }
  updatedAt: string | null
  updatedByName: string | null
}

/** Whether signers are reminded to consider a co-maker for a loan of this amount. Never a requirement. Same as coMakerSuggested on the server. */
export function coMakerSuggested(s: LoanSettings, amount: number): boolean {
  const from = s.coMakersFromAmount ?? 50000
  return from > 0 && amount >= from
}

/** Every application needs at least this net take-home pay (pesos). Same as MIN_NET_TAKE_HOME_PAY on the server. */
export const MIN_NET_TAKE_HOME_PAY = 5000

/** A full UDEI member number: not empty and not the provisional N-… ID an account gets at sign-up. */
export const isLinkedMemberId = (memberId: string | null | undefined) => !!memberId?.trim() && !memberId.trim().startsWith('N-')

/**
 * The limit for an applicant who isn't a linked member, or null when it doesn't apply.
 * The server also treats member numbers that aren't on record as not linked.
 */
export function nonMemberLimit(s: LoanSettings, linked: boolean): number | null {
  const limit = s.nonMemberMaxAmount ?? 5000
  return !linked && limit > 0 ? limit : null
}

/** Co-makers this application needs: one for an applicant who isn't a linked member; for members they are optional. */
export function coMakersRequiredFor(s: LoanSettings, linked: boolean): number {
  return nonMemberLimit(s, linked) !== null ? 1 : 0
}

/** Used until the server answers. Same values as the server's defaults (server/src/services/settings.js). */
export const FALLBACK_SETTINGS: LoanSettings = {
  products: {
    long_term: { label: 'Long term', monthlyRate: 2, maxTermMonths: 12 },
    emergency: { label: 'Short term (Emergency)', monthlyRate: 3, maxTermMonths: 5 },
  },
  minMonthlySalary: 10000,
  branches: ['Main Office'],
  coMakersRequired: 0,
  coMakersFromAmount: 50000,
  nonMemberMaxAmount: 5000,
  bonusCalendar: FALLBACK_BONUS_CALENDAR,
  modeChangeCutoffDay: 7,
  shortTermGraceDays: 0,
  conversionTermMonths: 12,
  serviceFee: { rate: 1, appliesTo: ['payroll'] },
  updatedAt: null,
  updatedByName: null,
}

let cached: LoanSettings | null = null
let inflight: Promise<LoanSettings> | null = null

export function fetchSettings(): Promise<LoanSettings> {
  if (cached) return Promise.resolve(cached)
  inflight ??= api<{ settings: LoanSettings }>('/api/settings')
    .then(({ settings }) => (cached = settings))
    .finally(() => (inflight = null))
  return inflight
}

/** Call after saving, so every page picks up the new rules. */
export function rememberSettings(s: LoanSettings) {
  cached = s
}

/** The current rules; FALLBACK_SETTINGS until they arrive. */
export function useSettings() {
  const [settings, setSettings] = useState<LoanSettings>(cached ?? FALLBACK_SETTINGS)
  const [loaded, setLoaded] = useState(!!cached)
  useEffect(() => {
    let live = true
    fetchSettings()
      .then((s) => live && (setSettings(s), setLoaded(true)))
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [])
  return { settings, loaded }
}
