import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { Application, Loan } from '../api'
import { centavos, date, LOAN_TYPE_LABEL, pesos } from '../format'
import { colors } from '../theme'
import { Badge, Card, Empty, Header, Row, s } from '../ui'
import { applicationBadge, loanBadge, SIGNERS } from './status'

type Props = {
  loans: Loan[]
  applications: Application[]
  loading: boolean
  onRefresh: () => void
  onOpenLoan: (id: string) => void
}

export default function LoansScreen({ loans, applications, loading, onRefresh, onOpenLoan }: Props) {
  // Approved applications already appear as loans.
  const openApps = applications.filter((a) => !a.loanId)
  return (
    <View style={{ flex: 1 }}>
      <Header title="My loans" subtitle="Balances, due dates and applications" />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={s.sectionTitle}>Loans</Text>
        {loans.length === 0 ? <Empty text="No loans yet." /> : null}
        {loans.map((l) => {
          const b = loanBadge(l)
          return (
            <Pressable key={l.id} onPress={() => onOpenLoan(l.id)} accessibilityRole="button">
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>
                    {LOAN_TYPE_LABEL[l.loanType]} · {l.loanNo}
                  </Text>
                  <Badge {...b} />
                </View>
                <Row label="Balance" value={l.status === 'for_release' ? '—' : centavos(l.balance)} strong />
                <Row label="Principal" value={centavos(l.principal)} />
                {l.nextDue ? <Row label="Next due" value={`${centavos(l.nextDue.amount)} on ${date(l.nextDue.dueDate)}`} /> : null}
                {l.status === 'for_release' ? (
                  <Text style={{ color: colors.muted, marginTop: 4 }}>Approved. The Treasurer will release it soon.</Text>
                ) : null}
              </Card>
            </Pressable>
          )
        })}

        <Text style={[s.sectionTitle, { marginTop: 12 }]}>Applications</Text>
        {openApps.length === 0 ? <Empty text="No applications in review." /> : null}
        {openApps.map((a) => (
          <Card key={a.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 16 }}>{a.applicationNo}</Text>
              <Badge {...applicationBadge(a)} />
            </View>
            <Row label={LOAN_TYPE_LABEL[a.loan.loanType]} value={pesos(a.loan.amount)} strong />
            <Row label="Term" value={`${a.loan.termMonths} months at ${a.loan.monthlyRate}%/mo`} />
            <Row label="Submitted" value={date(a.createdAt)} />
            <Steps app={a} />
            {a.denialNote ? <Text style={{ color: colors.danger, marginTop: 8 }}>Reason: {a.denialNote}</Text> : null}
          </Card>
        ))}
      </ScrollView>
    </View>
  )
}

/** The four signatures on the form, ticked as each signer approves. */
function Steps({ app }: { app: Application }) {
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      {SIGNERS.map((name) => {
        const signed = app.signed.find((x) => x.step === name)
        const waiting = app.waitingFor === name
        const color = signed?.decision === 'denied' ? colors.danger : signed ? colors.accent : waiting ? colors.warn : colors.border
        return (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
            <Text style={{ color: signed || waiting ? colors.text : colors.muted, flex: 1 }}>{name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {signed ? `${signed.decision === 'denied' ? 'Denied' : 'Signed'} ${date(signed.signedAt)}` : waiting ? 'Reviewing' : ''}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
