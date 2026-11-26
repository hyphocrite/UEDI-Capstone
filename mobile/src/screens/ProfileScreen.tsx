import { ScrollView, Text, View } from 'react-native'
import { PrivacyLink } from './PrivacyNotice'
import { API_URL, type MyScore } from '../api'
import { useAuth } from '../auth'
import { colors } from '../theme'
import { ScoreCard } from '../score'
import { Button, Card, Header, Row } from '../ui'

export default function ProfileScreen({ reminders, score }: { reminders: number | null; score: MyScore | null }) {
  const { session, signOut } = useAuth()
  return (
    <View style={{ flex: 1 }}>
      <Header title="Profile" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ScoreCard data={score} compact />
        <Card>
          <Row label="Name" value={session?.fullName ?? ''} />
          <Row label="Email" value={session?.email ?? ''} />
          <Row label="Member No." value={session?.memberNo ?? '—'} />
        </Card>
        <Card>
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 4 }}>Due-date reminders</Text>
          <Text style={{ color: colors.muted }}>
            {reminders == null
              ? 'Reminders are set after your mutual assistance loads.'
              : reminders > 0
                ? `${reminders} reminder${reminders > 1 ? 's' : ''} set: 3 days before and on each due date, at 8:00 AM.`
                : 'No reminders set. Allow notifications for this app to get due-date reminders.'}
          </Text>
        </Card>
        <PrivacyLink label="Privacy Notice" />
        <Button variant="outline" title="Sign out" onPress={signOut} />
        <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 24 }}>Server: {API_URL}</Text>
      </ScrollView>
    </View>
  )
}
