import { useState } from 'react'
import { Text, View } from 'react-native'
import { SEND_OPTIONS } from '../paymentModes'
import { api, type Loan, type PaymentSubmission, type PickedFile } from '../api'
import { pick } from '../documents'
import { centavos, date } from '../format'
import { colors } from '../theme'
import { Badge, Button, Card, Choice, ErrorText, Field } from '../ui'

type Method = 'e_money' | 'bank_transfer' | 'cash'
const METHODS: { value: Method; label: string; hint: string }[] = SEND_OPTIONS

const STATUS: Record<PaymentSubmission['status'], { text: string; tone: 'amber' | 'green' | 'red' | 'gray' }> = {
  submitted: { text: 'With the Treasurer', tone: 'amber' },
  received: { text: 'OR issued', tone: 'gray' },
  posted: { text: 'Posted', tone: 'green' },
  rejected: { text: 'Rejected', tone: 'red' },
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * "Send a payment": a member reports a payment made outside payroll, with the reference and a photo
 * of the receipt. Payroll deduction keeps running; this is an advance. The Treasurer issues the OR
 * and the Bookkeeper posts it to the ledger.
 */
export default function SendPayment({ loan, onSent }: { loan: Loan; onSent: () => void }) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<Method>('e_money')
  const [amount, setAmount] = useState(loan.nextDue ? String(loan.nextDue.amount / 100) : '')
  const [paidAt, setPaidAt] = useState(today)
  const [reference, setReference] = useState('')
  const [proof, setProof] = useState<PickedFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const choose = async (source: 'camera' | 'files') => {
    const r = await pick(source, 'proof_of_payment')
    if (typeof r === 'string') setError(r)
    else if (r) {
      setProof(r)
      setError(null)
    }
  }

  const send = async () => {
    const centavosPaid = Math.round(Number(amount.replace(/,/g, '')) * 100)
    if (!(centavosPaid > 0)) return setError('Enter the amount paid.')
    if (centavosPaid > loan.balance) return setError(`That is more than your balance of ${centavos(loan.balance)}.`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return setError('Enter the date paid as YYYY-MM-DD.')
    if (method !== 'cash' && !reference.trim()) return setError('Enter the reference number of the payment.')
    if (method !== 'cash' && !proof) return setError('Add a photo or screenshot of the receipt.')
    setBusy(true)
    setError(null)
    try {
      const { submission } = await api.sendPayment(loan.id, { amount: centavosPaid, method, paidAt, reference: reference.trim() || undefined })
      if (proof) {
        try {
          await api.uploadProof(submission._id, proof)
        } catch {
          setDone('The payment was sent, but the photo did not upload. Add it from the list below.')
          setOpen(false)
          onSent()
          return
        }
      }
      setDone(`${centavos(centavosPaid)} sent. You'll get an email once it is posted.`)
      setOpen(false)
      setReference('')
      setProof(null)
      onSent()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>Pay ahead</Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>Your payroll deduction keeps running. This is an advance payment.</Text>
      {done ? <Text style={{ color: colors.accent, marginTop: 8 }}>{done}</Text> : null}
      {open ? (
        <View style={{ marginTop: 12 }}>
          <Choice label="Mode of payment" value={method} options={METHODS} onChange={setMethod} wide />
          <Field label="Amount (₱)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" hint={`Balance ${centavos(loan.balance)}`} />
          <Field label="Date paid (YYYY-MM-DD)" value={paidAt} onChangeText={setPaidAt} maxLength={10} />
          <Field label={method === 'cash' ? 'Reference (optional)' : 'Reference number'} value={reference} onChangeText={setReference} maxLength={60} />
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>Proof {method === 'cash' ? '(optional)' : ''}</Text>
          {proof ? <Text style={{ color: colors.muted, marginBottom: 6 }}>{proof.name}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <View style={{ flex: 1 }}><Button title="Take photo" variant="outline" onPress={() => choose('camera')} /></View>
            <View style={{ flex: 1 }}><Button title="Choose file" variant="outline" onPress={() => choose('files')} /></View>
          </View>
          <ErrorText text={error} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" disabled={busy} onPress={() => { setOpen(false); setError(null) }} /></View>
            <View style={{ flex: 1 }}><Button title="Send" loading={busy} onPress={send} /></View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Button title="Send a payment" onPress={() => { setDone(null); setOpen(true) }} />
        </View>
      )}
    </Card>
  )
}

/** One sent payment and where it is; while it waits for the Treasurer, the proof can still be added. */
export function SubmissionRow({ s, onChanged }: { s: PaymentSubmission; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const st = STATUS[s.status]
  const addProof = async () => {
    const r = await pick('files', 'proof_of_payment')
    if (typeof r === 'string') return setError(r)
    if (!r) return
    try {
      await api.uploadProof(s._id, r)
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{centavos(s.amount)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {s.methodLabel} · {date(s.paidAt)}{s.reference ? ` · ref. ${s.reference}` : ''}{s.received?.orNumber ? ` · OR ${s.received.orNumber}` : ''}
          </Text>
        </View>
        <Badge text={st.text} tone={st.tone} />
      </View>
      {s.status === 'rejected' && s.rejected?.reason ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{s.rejected.reason}</Text> : null}
      {s.status === 'submitted' && !s.proof ? (
        <View style={{ marginTop: 6 }}><Button title="Add proof" variant="outline" onPress={addProof} /></View>
      ) : null}
      <ErrorText text={error} />
    </View>
  )
}
