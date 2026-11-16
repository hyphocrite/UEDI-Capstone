import { useEffect, useState } from 'react'
import { api } from './api'
import type { LoanType } from './applications'

export type LoanProduct = { label: string; monthlyRate: number; maxTermMonths: number }

/** UDEI's loan rules from the Settings page (GET /api/settings). */
export type LoanSettings = {
  products: Record<LoanType, LoanProduct>
  minMonthlySalary: number
  branches: string[]
  /** How many co-makers each application needs (0 to 2). */
  coMakersRequired: number
  /** Co-makers are needed only for loans of this amount (pesos) or more. 0: every loan. */
  coMakersFromAmount: number
  /** Applicants not linked to a UDEI member number borrow at most this (pesos), with a member as co-maker. 0: no limit. */
  nonMemberMaxAmount: number
  updatedAt: string | null
  updatedByName: string | null
}

/** How many co-makers a loan of this amount needs. Same rule as the server (services/settings.js). */
export function coMakersNeeded(s: LoanSettings, amount: number): number {
  return amount >= (s.coMakersFromAmount ?? 50000) ? s.coMakersRequired : 0
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

/** Co-makers this application needs: the amount rule, and at least one for an applicant who isn't a linked member. */
export function coMakersRequiredFor(s: LoanSettings, amount: number, linked: boolean): number {
  const needed = coMakersNeeded(s, amount)
  return nonMemberLimit(s, linked) !== null ? Math.max(needed, 1) : needed
}

/** Used until the server answers. Same values as the server's defaults (server/src/services/settings.js). */
export const FALLBACK_SETTINGS: LoanSettings = {
  products: {
    long_term: { label: 'Long term', monthlyRate: 2, maxTermMonths: 12 },
    emergency: { label: 'Emergency', monthlyRate: 3, maxTermMonths: 6 },
  },
  minMonthlySalary: 10000,
  branches: ['Main Office'],
  coMakersRequired: 1,
  coMakersFromAmount: 50000,
  nonMemberMaxAmount: 5000,
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
