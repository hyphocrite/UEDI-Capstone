import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { api, type Session } from '../api'
import { useAuth } from '../auth'
import { CONSENT, NOTICE, PRIVACY_NOTICE_VERSION } from '../privacy'
import { colors } from '../theme'
import { Button, Check, ErrorText, Header } from '../ui'

/** The Privacy Notice text, with the office contact from the server when it is set. */
export function NoticeText() {
  const [contact, setContact] = useState<string | null>(null)
  useEffect(() => {
    api.privacy().then((d) => setContact(d.contactEmail), () => setContact(null))
  }, [])
  return (
    <View>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Republic Act No. 10173, the Data Privacy Act of 2012 · version {PRIVACY_NOTICE_VERSION}</Text>
      {NOTICE.map((s) => (
        <View key={s.title} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>{s.title}</Text>
          {s.items.map((i) => <Text key={i} style={{ color: colors.text, marginLeft: 8 }}>• {i}</Text>)}
        </View>
      ))}
      <Text style={{ color: colors.text }}>Contact: the UDEI office{contact ? `, ${contact}` : ''}, Davao del Norte State College, Panabo City.</Text>
    </View>
  )
}

/** A "Privacy Notice" link that opens the notice in a full-screen sheet. */
export function PrivacyLink({ label = 'Read the Privacy Notice' }: { label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="link" hitSlop={8}>
        <Text style={{ color: colors.primary, fontWeight: '600', textDecorationLine: 'underline', marginBottom: 8 }}>{label}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Header title="Privacy Notice" right={<Pressable onPress={() => setOpen(false)} hitSlop={12}><Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text></Pressable>} />
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <NoticeText />
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

/** Accounts made before consent was asked agree once after sign-in before they can continue. */
export function ConsentScreen({ onAgreed }: { onAgreed: (s: Session) => void }) {
  const { signOut } = useAuth()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    if (!agree) return setError('Tick the box to agree to the Privacy Notice.')
    setBusy(true)
    setError(null)
    try {
      onAgreed((await api.consent()).session)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Before you continue" subtitle="UDEI's Privacy Notice" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <NoticeText />
        <View style={{ height: 12 }} />
        <Check label={CONSENT.account} value={agree} onChange={setAgree} />
        <ErrorText text={error} />
        <Button title="Agree and continue" onPress={submit} loading={busy} />
        <View style={{ height: 8 }} />
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </View>
  )
}
