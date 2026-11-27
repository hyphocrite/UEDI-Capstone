import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { api, type Loan, type Payment, type PaymentSubmission } from '../api'
import { centavos, date, LOAN_TYPE_LABEL } from '../format'
import { colors } from '../theme'
import { Badge, Card, Empty, ErrorText, Header, Row, s, ShowMore, useShowMore } from '../ui'
import { modeLabel, PAYMENT_METHOD_LABEL, frequencyLabel } from '../paymentModes'
import { loanBadge } from './status'
import SendPayment, { SubmissionRow } from './SendPayment'
import PaymentModeCard from './PaymentModeCard'


export default function LoanDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<{ loan: Loan; payments: Payment[]; submissions?: PaymentSubmission[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    api.loan(id).then(setData, (e) => setError((e as Error).message))
  }, [id, tick])
  const reload = () => setTick((t) => t + 1)

  const loan = data?.loan
  const today = new Date()
  const sentList = useShowMore(data?.submissions ?? [])
  const paidList = useShowMore(data?.payments ?? [])
  return (
    <View style={{ flex: 1 }}>
      <Header
        title={loan ? `Mutual Assistance ${loan.loanNo}` : 'Mutual Assistance'}
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
              <Row label="Term" value={loan.paymentMode === 'bonus' && loan.schedule.length === 1 ? `One payment on ${date(loan.schedule[0].dueDate)}` : `${loan.termMonths} months, ${frequencyLabel(loan.paymentFrequency)}`} />
              <Row label="Mode of payment" value={loan.paymentModeLabel ?? modeLabel(loan.paymentMode, loan.bonusType)} />
              {loan.convertedAt ? (
                <Text style={{ color: colors.warn, marginTop: 6 }}>
                  {`Converted to long term on ${date(loan.convertedAt)}: the short term wasn't fully paid by the end of its term.`}
                </Text>
              ) : null}
              <Row label="Released" value={date(loan.releasedAt)} />
              <Row label="Matures" value={date(loan.maturesOn)} />
              {loan.pastDue ? <Row label="Overdue" value={centavos(loan.pastDueAmount)} strong /> : null}
              {loan.paidAhead && loan.paidAhead.amount > 0 ? (
                <Row label="Paid ahead" value={`${loan.paidAhead.count} installment${loan.paidAhead.count === 1 ? '' : 's'} (${centavos(loan.paidAhead.amount)})`} />
              ) : null}
              {loan.status === 'active' && loan.finishesAround ? (
                <Text style={{ color: colors.accent, marginTop: 8 }}>
                  Your mutual assistance will finish around {date(loan.finishesAround)} at the current deduction.
                </Text>
              ) : null}
            </Card>

            {loan.status === 'active' ? <SendPayment loan={loan} onSent={reload} /> : null}
            {loan.status !== 'for_release' ? <PaymentModeCard loan={loan} onChanged={reload} /> : null}

            {data!.submissions?.length ? (
              <>
                <Text style={s.sectionTitle}>Payments you sent</Text>
                <Card style={{ paddingVertical: 8 }}>
                  {sentList.visible.map((x) => <SubmissionRow key={x._id} s={x} onChanged={reload} />)}
                  <ShowMore list={sentList} />
                </Card>
              </>
            ) : null}

            <Text style={s.sectionTitle}>Payment schedule</Text>
            <Card style={{ paddingVertical: 8 }}>
              {loan.schedule.length === 0 ? <Empty text="The schedule is set when the mutual assistance is released." /> : null}
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
              {paidList.visible.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <View>
                    <Text style={{ color: colors.text }}>{date(p.paidAt)}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{PAYMENT_METHOD_LABEL[p.method] ?? p.method}{p.orNumber ? ` · OR ${p.orNumber}` : ''}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{centavos(p.amount)}</Text>
                </View>
              ))}
              <ShowMore list={paidList} />
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
