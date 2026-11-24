import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { api } from '../api'
import type { LoanSettings, PickedFile } from '../api'
import { useAuth } from '../auth'
import { confirmAction } from '../confirm'
import { DOCUMENT_LABEL, DocumentSlots, missingTypes, sendAll } from '../documents'
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

// The amounts UDEI offers, in pesos. Keep in step with LOAN_AMOUNTS and NON_MEMBER_LOAN_AMOUNTS in
// client/src/components/loan-application/applicationForm.ts.
const LOAN_AMOUNTS = [25000, 50000, 75000, 100000]
const NON_MEMBER_LOAN_AMOUNTS = [1000, 2000, 3000, 4000, 5000]
// Every application needs at least this net take-home pay (the server checks it too).
const MIN_NET_TAKE_HOME_PAY = 5000

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
    coMaker1: '',
    coMaker2: '',
    payrollDeduction: false,
    autoRestructure: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [rules, setRules] = useState<LoanSettings>(FALLBACK)
  useEffect(() => {
    api.settings().then((r) => setRules(r.settings)).catch(() => {})
  }, [])
  // Until the office links the account to a UDEI member number it only has its own N-… ID: such
  // applicants borrow at most the non-member limit and need a member as co-maker.
  const linked = !!session?.memberId && !session.memberId.startsWith('N-')
  const nonMemberLimit = !linked && (rules.nonMemberMaxAmount ?? 5000) > 0 ? (rules.nonMemberMaxAmount ?? 5000) : null
  const amounts = nonMemberLimit === null ? LOAN_AMOUNTS : NON_MEMBER_LOAN_AMOUNTS.filter((a) => a <= nonMemberLimit)
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
    const net = num(f.netTakeHomePay)
    if (!(net > 0)) return setError('Enter your net take-home pay.')
    if (net < MIN_NET_TAKE_HOME_PAY) return setError(`Your net take-home pay must be at least ${pesos(MIN_NET_TAKE_HOME_PAY)}.`)
    if (!(amount > 0)) return setError('Choose the loan amount.')
    if (f.purpose.trim().length < 3) return setError('Give the reason for the loan.')
    if (nonMemberLimit !== null) {
      if (amount > nonMemberLimit) return setError(`Until your account is linked to a UDEI member number, you can borrow at most ${pesos(nonMemberLimit)}.`)
      if (!f.coMaker1.trim() && !f.coMaker2.trim()) return setError('Until your account is linked to a UDEI member number, you need a co-maker: a UDEI member who vouches for this loan.')
    }
    const missing = missingTypes(f.loanType, files).map((t) => DOCUMENT_LABEL[t])
    if (missing.length) return setError(`Supporting documents are required. Still missing: ${missing.join(', ')}.`)
    const kind = f.loanType === 'long_term' ? 'Long term' : 'Emergency'
    const ok = await confirmAction(
      'Submit this application?',
      `${kind} loan of ${pesos(amount)} over ${num(f.termMonths)} months. It then goes to the Bookkeeper, CreCom Chairman, President and Treasurer to sign.`,
      'Yes, submit',
    )
    if (!ok) return
    setBusy(true)
    try {
      const { application } = await api.apply({
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
        purpose: f.purpose.trim(),
        payrollDeduction: f.payrollDeduction,
        autoRestructure: f.autoRestructure,
        coMakers: [f.coMaker1, f.coMaker2].map((c) => c.trim()).filter(Boolean),
        // The documents sent right after filing; the server checks every required one is there.
        documentTypes: files.map((d) => d.type),
      })
      const failed = await sendAll(application.id, files)
      if (failed.length) {
        const text = `Your application was filed, but ${failed.join(', ')} couldn't be sent. Add them again from My loans.`
        if (Platform.OS === 'web') window.alert(text)
        else Alert.alert('Some documents were not sent', text)
      }
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
              hint={`As shown on your latest payslip. At least ${pesos(MIN_NET_TAKE_HOME_PAY)}.`}
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
            <Choice
              label="Amount"
              value={f.amount}
              options={amounts.map((a) => ({ value: String(a), label: `₱${a.toLocaleString('en-PH')}` }))}
              onChange={set('amount')}
            />
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
            <Field label="Reason for the loan" value={f.purpose} onChangeText={set('purpose')} placeholder="e.g. tuition, medical" />
            {nonMemberLimit !== null && (
              <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>
                {"Your account isn't linked to a UDEI member number yet, so you can borrow up to "}{pesos(nonMemberLimit)} and need a
                UDEI member as co-maker. Ask the office to link your account for larger loans.
              </Text>
            )}
            <Field
              label={
                nonMemberLimit !== null ? "Co-maker's member number"
                : (rules.coMakersRequired ?? 1) === 0 ? 'Co-maker (optional)'
                  : amount >= (rules.coMakersFromAmount ?? 0) ? "Co-maker's member number"
                    : `Co-maker (optional under ₱${(rules.coMakersFromAmount ?? 0).toLocaleString('en-PH')})`
              }
              value={f.coMaker1} onChangeText={set('coMaker1')} placeholder="A UDEI member who vouches for you" />
            <Field label="Second co-maker (optional)" value={f.coMaker2} onChangeText={set('coMaker2')} placeholder="Member number" />

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
            <Text style={s.sectionTitle}>Supporting documents</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 6 }}>
              Required: take a clear photo or choose a file (JPEG, PNG or PDF, up to 10 MB) for each. The office checks them before signing.
            </Text>
            <DocumentSlots loanType={f.loanType} files={files} onChange={setFiles} />
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
          <Button title={busy && files.length ? 'Sending documents…' : 'Submit application'} onPress={submit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
