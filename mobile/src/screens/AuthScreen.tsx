import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useAuth } from '../auth'
import { colors } from '../theme'
import { Button, Card, ErrorText, Field } from '../ui'

export default function AuthScreen() {
  const { signIn, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ fullName: '', email: '', memberNo: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setError(null)
    if (mode === 'register' && form.password !== form.confirm) return setError('The passwords do not match.')
    setBusy(true)
    try {
      if (mode === 'login') await signIn(form.email, form.password)
      else
        await register({
          fullName: form.fullName,
          email: form.email,
          memberNo: form.memberNo,
          phone: form.phone || undefined,
          password: form.password,
        })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.header, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 36 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>UDEI</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>UDEI Member</Text>
          <Text style={{ color: '#A7D7BF', marginTop: 6, fontSize: 15 }}>
            United DNSC Employees, Inc. Apply for Mutual Assistance loans and track your payments.
          </Text>
        </View>

        <View style={{ padding: 16, marginTop: -18 }}>
          <Card>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
              {mode === 'login' ? 'Sign in' : 'Create your member account'}
            </Text>
            <ErrorText text={error} />
            {mode === 'register' ? (
              <>
                <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} placeholder="Juan D. Dela Cruz" autoComplete="name" />
                <Field
                  label="UDEI member number"
                  value={form.memberNo}
                  onChangeText={set('memberNo')}
                  placeholder="e.g. 42"
                  hint="The office checks this against the member list before your first loan."
                />
                <Field label="Mobile number (optional)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="09XX XXX XXXX" />
              </>
            ) : null}
            <Field
              label="Email"
              value={form.email}
              onChangeText={set('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@dnsc.edu.ph"
            />
            <Field
              label="Password"
              value={form.password}
              onChangeText={set('password')}
              secureTextEntry
              hint={mode === 'register' ? 'At least 8 characters, with a letter and a number.' : undefined}
            />
            {mode === 'register' ? <Field label="Confirm password" value={form.confirm} onChangeText={set('confirm')} secureTextEntry /> : null}
            <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} />
            <View style={{ height: 8 }} />
            <Button
              variant="ghost"
              title={mode === 'login' ? 'New member? Create an account' : 'Already registered? Sign in'}
              onPress={() => {
                setError(null)
                setMode(mode === 'login' ? 'register' : 'login')
              }}
            />
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
