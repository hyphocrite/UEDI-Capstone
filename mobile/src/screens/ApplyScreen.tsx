import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { api } from '../api'
import type { LoanSettings } from '../api'
import { useAuth } from '../auth'
import { pesos } from '../format'
import { colors } from '../theme'
import { Button, Card, Check, Choice, ErrorText, Field, Header, Row, s } from '../ui'

// Used until the office's Settings arrive (GET /api/settings). The server applies the saved ones.
const FALLBACK: LoanSettings = {
  products: {
    long_term: { label: 'Long term', monthlyRate: 2, maxTermMonths: 12 },
    emergency: { label: 'Emergency', monthlyRate: 3, maxTermMonths: 6 },
  },
  minMonthlySalary: 10000,
}

type LoanType = 'long_term' | 'emergency'
type Frequency = 'monthly' | 'quincenal'

function splitName(full = '') {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return { firstName: full, middleInitial: '', lastName: '' }
  const lastName = parts.pop()!
  const mi = parts.length > 1 && /^[A-Z]\.?$/i.test(parts[parts.length - 1]) ? parts.pop()!.replace('.', '') : ''
  return { firstName: parts.join(' '), middleInitial: mi, lastName }
}

const num = (v: string) => Number(v.replace(/[,\s₱]/g, ''))

export default function ApplyScreen({ onDone }: { onDone: () => void }) {
  const { session } = useAuth()
  const [f, setF] = useState({
    ...splitName(session?.fullName),
    residenceAddress: '',
    employer: 'Davao del Norte State College',
    monthlySalary: '',
    netTakeHomePay: '',
    loanType: 'long_term' as LoanType,
    amount: '',
    termMonths: '12',
    paymentFrequency: 'quincenal' as Frequency,
    purpose: '',
    payrollDeduction: false,
    autoRestructure: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState<LoanSettings>(FALLBACK)
  useEffect(() => {
    api.settings().then((r) => setRules(r.settings)).catch(() => {})
  }, [])
  const MAX_TERM = { long_term: rules.products.long_term.maxTermMonths, emergency: rules.products.emergency.maxTermMonths }
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const amount = num(f.amount)
  const term = Math.max(1, Math.min(num(f.termMonths) || 1, MAX_TERM[f.loanType]))
  const rate = rules.products[f.loanType].monthlyRate
  // Interest on the remaining balance each month, as UDEI's ledger charges it.
  const r = rate / 100
  const monthly = amount > 0 ? (r > 0 ? (amount * r) / (1 - (1 + r) ** -term) : amount / term) : 0
  const interest = monthly * term - amount
  const perInstallment = f.paymentFrequency === 'quincenal' ? monthly / 2 : monthly

  const changeType = (t: LoanType) =>
    setF((x) => ({ ...x, loanType: t, termMonths: String(Math.min(num(x.termMonths) || MAX_TERM[t], MAX_TERM[t])) }))

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await api.apply({
        lastName: f.lastName,
        firstName: f.firstName,
        middleInitial: f.middleInitial || undefined,
        residenceAddress: f.residenceAddress,
        employer: f.employer,
        monthlySalary: num(f.monthlySalary),
        netTakeHomePay: num(f.netTakeHomePay),
        loanType: f.loanType,
        amount,
        termMonths: num(f.termMonths),
        paymentFrequency: f.paymentFrequency,
        purpose: f.purpose || undefined,
        payrollDeduction: f.payrollDeduction,
        autoRestructure: f.autoRestructure,
      })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Apply for a loan" subtitle="Mutual Assistance Application Form" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={s.sectionTitle}>About you</Text>
            <Field label="Last name" value={f.lastName} onChangeText={set('lastName')} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 3 }}>
                <Field label="First name" value={f.firstName} onChangeText={set('firstName')} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="M.I." value={f.middleInitial} onChangeText={set('middleInitial')} maxLength={3} />
              </View>
            </View>
            <Field label="Residence address" value={f.residenceAddress} onChangeText={set('residenceAddress')} placeholder="Purok, barangay, city" />
            <Field label="Employer" value={f.employer} onChangeText={set('employer')} />
            <Field label="Monthly salary (₱)" value={f.monthlySalary} onChangeText={set('monthlySalary')} keyboardType="numeric" placeholder="0.00" />
            <Field
              label="Net take-home pay (₱)"
              value={f.netTakeHomePay}
              onChangeText={set('netTakeHomePay')}
              keyboardType="numeric"
              placeholder="0.00"
              hint="As shown on your latest payslip."
            />
          </Card>

          <Card>
            <Text style={s.sectionTitle}>The loan</Text>
            <Choice
              label="Loan type"
              value={f.loanType}
              onChange={changeType}
              options={[
                { value: 'long_term', label: 'Long term' },
                { value: 'emergency', label: 'Emergency' },
              ]}
            />
            <Field label="Amount (₱)" value={f.amount} onChangeText={set('amount')} keyboardType="numeric" placeholder="0.00" />
            <Field
              label="Term (months)"
              value={f.termMonths}
              onChangeText={set('termMonths')}
              keyboardType="number-pad"
              hint={`Up to ${MAX_TERM[f.loanType]} months for ${f.loanType === 'long_term' ? 'Long term' : 'Emergency'} loans.`}
            />
            <Choice
              label="Payroll deduction"
              value={f.paymentFrequency}
              onChange={set('paymentFrequency')}
              options={[
                { value: 'quincenal', label: 'Quincenal (15th & 30th)' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
            <Field label="Purpose (optional)" value={f.purpose} onChangeText={set('purpose')} placeholder="e.g. tuition, medical" />

            <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, marginTop: 4 }}>
              <Row label="Interest rate" value={`${rate}% per month`} />
              <Row label="Interest for the term" value={pesos(interest)} />
              <Row label={`Estimated per ${f.paymentFrequency === 'quincenal' ? 'payday' : 'month'}`} value={pesos(perInstallment)} strong />
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                Estimate only. The Bookkeeper confirms your existing balances before approval.
              </Text>
            </View>
          </Card>

          <Card>
            <Text style={s.sectionTitle}>Agreement</Text>
            <Check
              value={f.payrollDeduction}
              onChange={set('payrollDeduction')}
              label="I authorize UDEI to deduct the payments for this loan from my salary."
            />
            <Check
              value={f.autoRestructure}
              onChange={set('autoRestructure')}
              label="If the loan is not fully paid at maturity, I agree it will be restructured automatically."
            />
          </Card>

          <ErrorText text={error} />
          <Button title="Submit application" onPress={submit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
