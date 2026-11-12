import { RefreshControl, ScrollView, Text, View } from 'react-native'
import type { Application, Loan } from '../api'
import { useAuth } from '../auth'
import { centavos, date, daysUntil, LOAN_TYPE_LABEL, pesos } from '../format'
import { colors } from '../theme'
import { Badge, Button, Card, Empty, Header, Row, s } from '../ui'
import { applicationBadge } from './status'

type Props = {
  loans: Loan[]
  applications: Application[]
  loading: boolean
  onRefresh: () => void
  onApply: () => void
  onOpenLoan: (id: string) => void
}

export default function HomeScreen({ loans, applications, loading, onRefresh, onApply, onOpenLoan }: Props) {
  const { session } = useAuth()
  const active = loans.filter((l) => l.status === 'active')
  const balance = active.reduce((sum, l) => sum + l.balance, 0)
  const upcoming = active
    .filter((l) => l.nextDue)
    .sort((a, b) => new Date(a.nextDue!.dueDate).getTime() - new Date(b.nextDue!.dueDate).getTime())
  const next = upcoming[0]
  const pending = applications.find((a) => a.status === 'pending')
  const firstName = session?.fullName.split(' ')[0] ?? ''

  return (
    <View style={{ flex: 1 }}>
      <Header title={`Hi, ${firstName}`} subtitle={session?.memberNo ? `Member No. ${session.memberNo}` : 'UDEI member'} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <Text style={{ color: '#A7D7BF', fontSize: 13 }}>Total loan balance</Text>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 4 }}>{centavos(balance)}</Text>
          <Text style={{ color: '#A7D7BF', marginTop: 4 }}>
            {active.length === 0 ? 'No active loans' : `${active.length} active loan${active.length > 1 ? 's' : ''}`}
          </Text>
        </Card>

        {next?.nextDue ? (
          <Card style={next.pastDue ? { borderColor: colors.danger } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.sectionTitle}>Next payment</Text>
              {next.pastDue ? <Badge text="Past due" tone="red" /> : <Badge text={dueIn(next.nextDue.dueDate)} tone="green" />}
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{centavos(next.nextDue.amount)}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>
              Due {date(next.nextDue.dueDate)} · Loan {next.loanNo}
            </Text>
            {next.pastDue ? (
              <Text style={{ color: colors.danger, marginTop: 8 }}>
                {centavos(next.pastDueAmount)} is overdue. Please settle it at the UDEI office.
              </Text>
            ) : null}
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Deducted from your payroll, per your loan agreement.</Text>
            <View style={{ height: 10 }} />
            <Button variant="outline" title="View loan" onPress={() => onOpenLoan(next.id)} />
          </Card>
        ) : null}

        {pending ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.sectionTitle}>Your application</Text>
              <Badge {...applicationBadge(pending)} />
            </View>
            <Row label="Application" value={pending.applicationNo} />
            <Row label={LOAN_TYPE_LABEL[pending.loan.loanType]} value={pesos(pending.loan.amount)} strong />
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              Waiting for the {pending.waitingFor} to sign ({pending.signed.length} of 4 signed).
            </Text>
          </Card>
        ) : (
          <Card>
            <Text style={s.sectionTitle}>Need financial assistance?</Text>
            <Text style={{ color: colors.muted, marginBottom: 12 }}>
              Apply for a Long term or Emergency loan. The Bookkeeper, Treasurer, Credit Committee Chairman and President
              review every application.
            </Text>
            <Button title="Apply for a loan" onPress={onApply} />
          </Card>
        )}

        {!loading && loans.length === 0 && applications.length === 0 ? <Empty text="Your loans will show up here." /> : null}
      </ScrollView>
    </View>
  )
}

function dueIn(d: string) {
  const n = daysUntil(d)
  if (n <= 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  return `In ${n} days`
}
