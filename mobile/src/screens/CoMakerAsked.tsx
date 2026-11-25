import { useState } from 'react'
import { Text, View } from 'react-native'
import { api, type Application } from '../api'
import { date } from '../format'
import { colors } from '../theme'
import { Button, ErrorText, Field } from '../ui'

/**
 * On My loans: a signer asked for a co-maker. Shows who asked and why, and lets the member name one
 * or two UDEI members by member number. They then accept in their own Co-maker screen.
 */
export default function CoMakerAsked({ app, onSaved }: { app: Application; onSaved: () => void }) {
  const request = app.coMakerRequest
  const named = app.coMakers ?? []
  const [first, setFirst] = useState(named[0]?.memberId ?? '')
  const [second, setSecond] = useState(named[1]?.memberId ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!request || app.status !== 'pending') return null

  const waiting = named.filter((c) => c.status === 'pending')
  const save = async () => {
    const list = [first, second].map((s) => s.trim()).filter(Boolean)
    if (!list.length) return setError('Enter the member number of a UDEI member who will be your co-maker.')
    setBusy(true)
    setError(null)
    try {
      await api.setCoMakers(app.id, list)
      setOpen(false)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ marginTop: 12, backgroundColor: colors.warnSoft, borderRadius: 10, padding: 12 }}>
      <Text style={{ fontWeight: '700', color: colors.warn }}>A co-maker is needed</Text>
      <Text style={{ color: colors.warn, marginTop: 4 }}>
        {request.role ? `The ${request.role}, ` : ''}{request.byName}, asked on {date(request.at)}: “{request.note}”
      </Text>
      <Text style={{ color: colors.warn, marginTop: 4, fontSize: 13 }}>
        {waiting.length
          ? `Waiting for ${waiting.map((c) => c.name ?? c.memberId).join(' and ')} to accept in their Co-maker screen.`
          : 'Name a UDEI member who vouches for this loan. Signing goes on once they accept.'}
      </Text>
      {open ? (
        <View style={{ marginTop: 10 }}>
          <Field label="Co-maker's member number" value={first} onChangeText={setFirst} autoCapitalize="characters" maxLength={32} />
          <Field label="Second co-maker (optional)" value={second} onChangeText={setSecond} autoCapitalize="characters" maxLength={32} />
          <ErrorText text={error} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" variant="outline" disabled={busy} onPress={() => { setOpen(false); setError(null) }} /></View>
            <View style={{ flex: 1 }}><Button title="Send" loading={busy} onPress={save} /></View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Button title={named.length ? 'Change co-makers' : 'Add a co-maker'} variant="outline" onPress={() => setOpen(true)} />
        </View>
      )}
    </View>
  )
}
