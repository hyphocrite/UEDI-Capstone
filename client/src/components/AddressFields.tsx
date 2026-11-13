import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

type Place = { code: string; name: string }
type Parsed = { province: Place | null; town: Place | null; barangay: Place | null; street: string }

/** "Purok 3, New Visayas, City of Panabo, Davao del Norte": what is stored as the residence address. */
const compose = (street: string, barangay?: Place | null, town?: Place | null, province?: Place | null) =>
  [street.trim(), barangay?.name, town?.name, province?.name].filter(Boolean).join(', ')

// The lists rarely change, so each one is fetched once per page load.
const cache = new Map<string, Promise<Place[]>>()
function list(path: string, key: 'provinces' | 'towns' | 'barangays'): Promise<Place[]> {
  if (!cache.has(path)) {
    const p = api<Record<string, Place[]>>(path).then((d) => d[key])
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path)!
}

/**
 * Province, city or municipality, and barangay dropdowns (official PSGC lists), plus the house,
 * street or purok. Reports the whole address as one line through onChange. An address typed before
 * the dropdowns existed is split back into them when it can be.
 */
export default function AddressFields({ value, onChange, idPrefix = 'addr' }: { value: string; onChange: (address: string) => void; idPrefix?: string }) {
  const [provinces, setProvinces] = useState<Place[]>([])
  // Each list remembers which parent it was loaded for, so a stale list is never shown.
  const [townList, setTownList] = useState<{ parent: string; items: Place[] }>({ parent: '', items: [] })
  const [barangayList, setBarangayList] = useState<{ parent: string; items: Place[] }>({ parent: '', items: [] })
  const [province, setProvince] = useState<Place | null>(null)
  const [town, setTown] = useState<Place | null>(null)
  const [barangay, setBarangay] = useState<Place | null>(null)
  const [street, setStreet] = useState('')
  const [error, setError] = useState('')
  // The last address this component reported, to tell its own changes from new values (a draft, a member's record).
  const reported = useRef<string | null>(null)

  useEffect(() => {
    list('/api/locations/provinces', 'provinces').then(setProvinces).catch(() => setError('Could not load the province list. Reload the page.'))
  }, [])

  // A value from outside: split it into the dropdowns.
  useEffect(() => {
    if (value === reported.current) return
    reported.current = value
    api<{ address: Parsed }>(`/api/locations/parse?address=${encodeURIComponent(value)}`)
      .then(({ address: a }) => {
        setProvince(a.province); setTown(a.town); setBarangay(a.barangay); setStreet(a.street)
      })
      .catch(() => setStreet(value))
  }, [value])

  useEffect(() => {
    if (!province) return
    list(`/api/locations/towns?province=${province.code}`, 'towns')
      .then((items) => setTownList({ parent: province.code, items }))
      .catch(() => setError('Could not load the towns. Reload the page.'))
  }, [province])

  useEffect(() => {
    if (!town) return
    list(`/api/locations/barangays?town=${town.code}`, 'barangays')
      .then((items) => setBarangayList({ parent: town.code, items }))
      .catch(() => setError('Could not load the barangays. Reload the page.'))
  }, [town])

  const towns = province && townList.parent === province.code ? townList.items : []
  const barangays = town && barangayList.parent === town.code ? barangayList.items : []

  const report = (s: string, b: Place | null, t: Place | null, p: Place | null) => {
    const next = compose(s, b, t, p)
    reported.current = next
    onChange(next)
  }
  const pick = (options: Place[], code: string) => options.find((o) => o.code === code) ?? null

  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label" htmlFor={`${idPrefix}-province`}>Province</label>
          <select id={`${idPrefix}-province`} className="input" value={province?.code ?? ''}
            onChange={(e) => { const p = pick(provinces, e.target.value); setProvince(p); setTown(null); setBarangay(null); report(street, null, null, p) }}>
            <option value="">Choose a province</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idPrefix}-town`}>City or municipality</label>
          <select id={`${idPrefix}-town`} className="input" value={town?.code ?? ''} disabled={!province}
            onChange={(e) => { const t = pick(towns, e.target.value); setTown(t); setBarangay(null); report(street, null, t, province) }}>
            <option value="">{province ? 'Choose a city or municipality' : 'Choose the province first'}</option>
            {/* Keep a parsed town visible while its list loads. */}
            {town && !towns.some((t) => t.code === town.code) && <option value={town.code}>{town.name}</option>}
            {towns.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor={`${idPrefix}-barangay`}>Barangay</label>
          <select id={`${idPrefix}-barangay`} className="input" value={barangay?.code ?? ''} disabled={!town}
            onChange={(e) => { const b = pick(barangays, e.target.value); setBarangay(b); report(street, b, town, province) }}>
            <option value="">{town ? 'Choose a barangay' : 'Choose the city first'}</option>
            {barangay && !barangays.some((b) => b.code === barangay.code) && <option value={barangay.code}>{barangay.name}</option>}
            {barangays.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div className="min-w-0">
        <label className="label" htmlFor={`${idPrefix}-street`}>House no., street or purok</label>
        <input id={`${idPrefix}-street`} className="input" maxLength={150} placeholder="e.g. Purok 3, Rizal St." value={street}
          onChange={(e) => { setStreet(e.target.value); report(e.target.value, barangay, town, province) }} />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
