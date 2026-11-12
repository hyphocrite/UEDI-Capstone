import { useEffect, useState } from 'react'
import { api } from './api'
import type { LoanType } from './applications'

export type LoanProduct = { label: string; monthlyRate: number; maxTermMonths: number }

/** UDEI's loan rules from the Settings page (GET /api/settings). */
export type LoanSettings = {
  products: Record<LoanType, LoanProduct>
  minMonthlySalary: number
  branches: string[]
  updatedAt: string | null
  updatedByName: string | null
}

/** Used until the server answers. Same values as the server's defaults (server/src/services/settings.js). */
export const FALLBACK_SETTINGS: LoanSettings = {
  products: {
    long_term: { label: 'Long term', monthlyRate: 2, maxTermMonths: 12 },
    emergency: { label: 'Emergency', monthlyRate: 3, maxTermMonths: 6 },
  },
  minMonthlySalary: 10000,
  branches: ['Main Office'],
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
