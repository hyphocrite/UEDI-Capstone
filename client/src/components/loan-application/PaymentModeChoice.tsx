import { BONUS_TYPES, PAYMENT_MODES } from '../../lib/paymentModes'
import type { BonusType, PaymentMode } from '../../lib/paymentModes'

const card = (on: boolean) =>
  `flex min-w-0 cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-accent ${
    on ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700' : 'border-brand-200 bg-white hover:bg-brand-50'
  }`

/**
 * Mode of payment as radio cards: payroll deduction, bonus, cash or bank transfer. The four bonuses
 * appear only when Bonus is picked. Used on the application form and the change-of-mode dialog.
 */
export default function PaymentModeChoice({ mode, bonusType, onChange, modes = PAYMENT_MODES, name = 'paymentMode' }: {
  mode: PaymentMode
  bonusType: BonusType | ''
  onChange: (mode: PaymentMode, bonusType: BonusType | '') => void
  modes?: { value: PaymentMode; label: string; hint?: string }[]
  name?: string
}) {
  return (
    <div className="min-w-0 space-y-3">
      <fieldset className="min-w-0">
        <legend className="label">Mode of payment</legend>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {modes.map((m) => (
            <label key={m.value} className={card(mode === m.value)}>
              <span className="flex items-center gap-2 font-semibold text-ink">
                <input type="radio" name={name} value={m.value} checked={mode === m.value} onChange={() => onChange(m.value, m.value === 'bonus' ? bonusType : '')} />
                {m.label}
              </span>
              {m.hint && <span className="mt-0.5 text-xs text-brand-600">{m.hint}</span>}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === 'bonus' && (
        <fieldset className="min-w-0">
          <legend className="label">Charge to</legend>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {BONUS_TYPES.map((b) => (
              <label key={b.value} className={card(bonusType === b.value)}>
                <span className="flex items-center gap-2 font-semibold text-ink">
                  <input type="radio" name={`${name}-bonus`} value={b.value} checked={bonusType === b.value} onChange={() => onChange('bonus', b.value)} />
                  {b.short}
                </span>
                <span className="mt-0.5 text-xs text-brand-600">{b.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
