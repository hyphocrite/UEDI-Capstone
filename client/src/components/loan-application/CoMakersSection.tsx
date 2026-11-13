import { useEffect, useState } from 'react'
import { CheckCircle2, Users } from 'lucide-react'
import Field, { FormSection } from './Field'
import type { Form } from './applicationForm'
import { api } from '../../lib/api'

type Lookup = { state: 'idle' | 'checking' | 'ok' | 'error'; text: string }

/** One member number, with the member's name looked up as it is typed. */
function CoMakerField({ id, label, value, onChange, applicantId }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  applicantId: string
}) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle', text: '' })

  useEffect(() => {
    const memberId = value.trim()
    let cancelled = false
    const timer = setTimeout(() => {
      if (!memberId) return setLookup({ state: 'idle', text: '' })
      if (memberId === applicantId) return setLookup({ state: 'error', text: "The applicant can't be their own co-maker." })
      setLookup({ state: 'checking', text: 'Looking up…' })
      api<{ name: string }>(`/api/comaker/lookup?memberId=${encodeURIComponent(memberId)}`)
        .then((d) => !cancelled && setLookup({ state: 'ok', text: d.name }))
        .catch((err: unknown) => !cancelled && setLookup({ state: 'error', text: err instanceof Error ? err.message : 'Could not look up that member.' }))
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, applicantId])

  return (
    <Field id={id} label={label}>
      <input id={id} className="input" maxLength={32} placeholder="Member no., e.g. 42" value={value} onChange={(e) => onChange(e.target.value)} />
      {lookup.text && (
        <p className={`mt-1 flex items-center gap-1 text-xs ${lookup.state === 'ok' ? 'font-semibold text-emerald-700' : lookup.state === 'error' ? 'text-red-700' : 'text-brand-500'}`}>
          {lookup.state === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />} {lookup.text}
        </p>
      )}
    </Field>
  )
}

/**
 * The co-makers: UDEI members who vouch for the loan. They confirm in their co-maker portal
 * before the Bookkeeper can sign, and are told if the borrower later misses a payment.
 */
export default function CoMakersSection({ form, update, required }: { form: Form; update: (patch: Partial<Form>) => void; required: number }) {
  return (
    <FormSection title="Co-makers">
      <p className="mb-3 flex items-start gap-2 text-sm text-brand-700">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          {required === 0 ? 'Optional. ' : `${required === 1 ? 'One co-maker is' : `${required} co-makers are`} required. `}
          A co-maker is a UDEI member with an account who vouches for this loan. They confirm online before signing starts,
          and can see how the loan is being paid.
        </span>
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CoMakerField id="coMaker1" label={required >= 1 ? 'Co-maker' : 'Co-maker (optional)'} value={form.coMaker1} onChange={(coMaker1) => update({ coMaker1 })} applicantId={form.memberId.trim()} />
        <CoMakerField id="coMaker2" label={required >= 2 ? 'Second co-maker' : 'Second co-maker (optional)'} value={form.coMaker2} onChange={(coMaker2) => update({ coMaker2 })} applicantId={form.memberId.trim()} />
      </div>
    </FormSection>
  )
}
