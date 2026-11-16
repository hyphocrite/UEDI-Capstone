import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { api, type CoMakerPortal, type CoMakerRequest, type VouchedLoan } from '../api'
import { confirmAction } from '../confirm'
import { centavos, date, LOAN_TYPE_LABEL, pesos } from '../format'
import { colors } from '../theme'
import { Badge, Button, Card, Empty, ErrorText, Header, Row, s } from '../ui'

const STANDING: Record<VouchedLoan['standing'], { text: string; tone: 'green' | 'red' | 'gray' }> = {
  on_track: { text: 'On track', tone: 'green' },
  behind: { text: 'Behind', tone: 'red' },
  paid: { text: 'Paid', tone: 'gray' },
}

/**
 * The co-maker portal, as on the web Co-maker page: alerts on top, requests waiting for your answer
 * (accept or decline, each confirmed first), and the loans you vouched for.
 */
export default function CoMakerScreen({ onChanged }: { onChanged: () => void }) {
  const [portal, setPortal] = useState<CoMakerPortal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPortal(await api.coMaker())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred, so no state is set synchronously inside the effect.
    void Promise.resolve().then(load)
  }, [load])

  const waiting = portal?.requests.filter((r) => r.status === 'pending' && r.myStatus === 'pending') ?? []
  const answered = portal?.requests.filter((r) => !(r.status === 'pending' && r.myStatus === 'pending')) ?? []

  return (
    <View style={{ flex: 1 }}>
      <Header title="Co-maker" subtitle="Loans you vouch for" />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        <ErrorText text={error} />
        {portal && !portal.linked ? <Empty text="Your account isn't linked to your member record yet, so co-maker requests can't reach you." /> : null}

        {portal?.alerts.map((a) => (
          <View key={a.loanId} style={[s.error, { borderLeftWidth: 4, borderLeftColor: colors.danger }]} accessibilityRole="alert">
            <Text style={{ color: colors.danger, fontWeight: '600' }}>{a.text}</Text>
          </View>
        ))}

        {portal?.linked ? (
          <>
            <Text style={s.sectionTitle}>Waiting for your answer</Text>
            {waiting.length ? waiting.map((r) => (
              <RequestCard key={r.applicationId} request={r} onAnswered={() => { load(); onChanged() }} />
            )) : <Empty text="No requests waiting for your answer." />}

            <Text style={s.sectionTitle}>Loans you vouched for</Text>
            {portal.loans.length ? portal.loans.map((l) => (
              <Card key={l.loanId}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{l.borrowerName}</Text>
                  <Badge text={STANDING[l.standing].text} tone={STANDING[l.standing].tone} />
                </View>
                <Row label="Loan" value={l.loanNo} />
                <Row label="Balance" value={centavos(l.balance)} strong />
                {l.nextDue ? <Row label="Next due" value={`${centavos(l.nextDue.amount)} on ${date(l.nextDue.dueDate)}`} /> : null}
                {l.pastDue ? <Text style={{ color: colors.danger, marginTop: 4 }}>{centavos(l.pastDueAmount)} past due.</Text> : null}
              </Card>
            )) : <Empty text="You haven't vouched for a released loan yet." />}

            {answered.length ? (
              <>
                <Text style={s.sectionTitle}>Answered</Text>
                {answered.map((r) => (
                  <Card key={r.applicationId}>
                    <Row label={r.borrowerName} value={pesos(r.amount)} />
                    <Text style={{ color: colors.muted }}>You {r.myStatus}{r.respondedAt ? ` on ${date(r.respondedAt)}` : ''} · application {r.status}</Text>
                  </Card>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function RequestCard({ request: r, onAnswered }: { request: CoMakerRequest; onAnswered: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'accepted' | 'declined' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const answer = async (decision: 'accepted' | 'declined') => {
    const ok = await confirmAction(
      decision === 'accepted' ? 'Vouch for this loan?' : 'Decline this request?',
      decision === 'accepted'
        ? `You agree to be co-maker for ${r.borrowerName}'s ${pesos(r.amount)} loan. If they miss payments, it lowers your member score and UDEI may contact you.`
        : `${r.borrowerName}'s application can't be signed without a co-maker; they would need to name someone else.`,
      decision === 'accepted' ? 'Yes, vouch' : 'Yes, decline',
    )
    if (!ok) return
    setBusy(decision)
    setError(null)
    try {
      await api.respondCoMaker(r.applicationId, decision, decision === 'declined' ? note.trim() || undefined : undefined)
      onAnswered()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <Text style={{ fontWeight: '700', color: colors.text }}>{r.borrowerName} asked you to vouch</Text>
      <Row label={LOAN_TYPE_LABEL[r.loanType] ?? r.loanType} value={`${pesos(r.amount)} · ${r.termMonths} months`} strong />
      {r.purpose ? <Text style={{ color: colors.muted }}>“{r.purpose}”</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{r.applicationNo} · filed {date(r.filedAt)}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note if you decline (optional)"
        placeholderTextColor={colors.muted}
        maxLength={300}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginTop: 10, color: colors.text, backgroundColor: '#fff' }}
      />
      <ErrorText text={error} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}><Button variant="outline" title="Decline" loading={busy === 'declined'} disabled={busy !== null} onPress={() => answer('declined')} /></View>
        <View style={{ flex: 1 }}><Button title="Accept" loading={busy === 'accepted'} disabled={busy !== null} onPress={() => answer('accepted')} /></View>
      </View>
    </Card>
  )
}
