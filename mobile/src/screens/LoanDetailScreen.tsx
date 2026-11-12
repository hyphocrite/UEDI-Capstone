import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { api, type Loan, type Payment } from '../api'
import { centavos, date, LOAN_TYPE_LABEL } from '../format'
import { colors } from '../theme'
import { Badge, Card, Empty, ErrorText, Header, Row, s } from '../ui'
import { loanBadge } from './status'

const METHOD: Record<string, string> = { payroll: 'Payroll deduction', cash: 'Cash', other: 'Other' }

export default function LoanDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<{ loan: Loan; payments: Payment[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.loan(id).then(setData, (e) => setError((e as Error).message))
  }, [id])

  const loan = data?.loan
  const today = new Date()
  return (
    <View style={{ flex: 1 }}>
      <Header
        title={loan ? `Loan ${loan.loanNo}` : 'Loan'}
        subtitle={loan ? LOAN_TYPE_LABEL[loan.loanType] : undefined}
        right={
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Back</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ErrorText text={error} />
        {!loan && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}
        {loan ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted }}>Remaining balance</Text>
                <Badge {...loanBadge(loan)} />
              </View>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginVertical: 4 }}>
                {loan.status === 'for_release' ? '—' : centavos(loan.balance)}
              </Text>
              {loan.totalPayable > 0 ? <Progress paid={loan.amountPaid} total={loan.totalPayable} /> : null}
              <Row label="Principal" value={centavos(loan.principal)} />
              <Row label="Rate" value={`${loan.monthlyRate}% per month`} />
              <Row label="Term" value={`${loan.termMonths} months, ${loan.paymentFrequency}`} />
              <Row label="Released" value={date(loan.releasedAt)} />
              <Row label="Matures" value={date(loan.maturesOn)} />
              {loan.pastDue ? <Row label="Overdue" value={centavos(loan.pastDueAmount)} strong /> : null}
            </Card>

            <Text style={s.sectionTitle}>Payment schedule</Text>
            <Card style={{ paddingVertical: 8 }}>
              {loan.schedule.length === 0 ? <Empty text="The schedule is set when the loan is released." /> : null}
              {loan.schedule.map((x) => {
                const paid = x.paid >= x.totalDue
                const late = !paid && new Date(x.dueDate) < today
                return (
                  <View
                    key={x.no}
                    style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' }}
                  >
                    <Text style={{ width: 28, color: colors.muted }}>{x.no}</Text>
                    <Text style={{ flex: 1, color: colors.text }}>{date(x.dueDate)}</Text>
                    <Text style={{ color: colors.text, fontWeight: '600', marginRight: 10 }}>{centavos(x.totalDue)}</Text>
                    <Badge
                      text={paid ? 'Paid' : late ? 'Late' : x.paid > 0 ? 'Partial' : 'Due'}
                      tone={paid ? 'green' : late ? 'red' : x.paid > 0 ? 'amber' : 'gray'}
                    />
                  </View>
                )
              })}
            </Card>

            <Text style={s.sectionTitle}>Payments received</Text>
            <Card style={{ paddingVertical: 8 }}>
              {data!.payments.length === 0 ? <Empty text="No payments yet." /> : null}
              {data!.payments.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <View>
                    <Text style={{ color: colors.text }}>{date(p.paidAt)}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{METHOD[p.method] ?? p.method}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{centavos(p.amount)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function Progress({ paid, total }: { paid: number; total: number }) {
  const pct = Math.min(100, Math.round((paid / total) * 100))
  return (
    <View style={{ marginVertical: 10 }}>
      <View style={{ height: 8, backgroundColor: colors.accentSoft, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 8, backgroundColor: colors.accent }} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
        {centavos(paid)} of {centavos(total)} paid ({pct}%)
      </Text>
    </View>
  )
}
