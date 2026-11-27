import { useState } from 'react'
import { Text, View } from 'react-native'
import { api, type Loan } from '../api'
import { date } from '../format'
import { BONUS_OPTIONS, CHANGE_OPTIONS, modeLabel, type BonusType, type PaymentMode } from '../paymentModes'
import { colors } from '../theme'
import { Button, Card, Choice, ErrorText, Field, ShowMore, useShowMore } from '../ui'

/**
 * How the loan is paid, its changes, and changing it for a coming month. A change made after the
 * cutoff day (Settings, usually the 7th) starts next month: HR is billed in the first week.
 */
export default function PaymentModeCard({ loan, onChanged }: { loan: Loan; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PaymentMode>(loan.paymentMode ?? 'payroll')
  const [bonusType, setBonusType] = useState<BonusType | ''>(loan.bonusType ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const history = [...(loan.paymentModeHistory ?? [])].filter((h) => h.note !== 'On the application').reverse()
  // The latest 3, then Show more.
  const historyList = useShowMore(history, 3)

  const send = async () => {
    if (mode === 'bonus' && !bonusType) return setError('Choose which bonus it is charged to.')
    setBusy(true)
    setError(null)
    try {
      const r = await api.changePaymentMode(loan.id, { mode, bonusType: mode === 'bonus' ? (bonusType as BonusType) : undefined, note: note.trim() || undefined })
      setDone(r.message)
      setOpen(false)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>Mode of payment</Text>
      <Text style={{ color: colors.text, marginTop: 4 }}>This month: {loan.paymentModeLabel ?? modeLabel(loan.paymentMode, loan.bonusType)}</Text>
      {historyList.visible.map((h, i) => (
        <Text key={`${h.effectiveFrom}-${i}`} style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
          {modeLabel(h.mode, h.bonusType)} from {date(h.effectiveFrom)}{h.note ? ` · “${h.note}”` : ''}
        </Text>
      ))}
      <ShowMore list={historyList} />
      {done ? <Text style={{ color: colors.accent, marginTop: 8 }}>{done}</Text> : null}
      {loan.status === 'active' && !open ? (
        <View style={{ marginTop: 10 }}>
          <Button title="Change mode of payment" variant="outline" onPress={() => { setDone(null); setOpen(true) }} />
        </View>
      ) : null}
      {open ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>
            A change on or before the first week of the month starts that month; later ones start next month, because UDEI bills
            payroll in the first week. To pay cash ahead while staying on payroll, use Send a payment instead.
          </Text>
          <Choice label="Mode of payment" value={mode} onChange={(m) => { setMode(m); setError(null) }} options={CHANGE_OPTIONS} wide />
          {mode === 'bonus' ? <Choice label="Which bonus?" value={bonusType} onChange={setBonusType} options={BONUS_OPTIONS} wide /> : null}
          <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} />
          <ErrorText text={error} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" disabled={busy} onPress={() => setOpen(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Change it" loading={busy} onPress={send} /></View>
          </View>
        </View>
      ) : null}
    </Card>
  )
}
