import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { api, ApiError } from '../api'
import { useAuth } from '../auth'
import { colors } from '../theme'
import { Button, Card, ErrorText, Field } from '../ui'

export default function AuthScreen() {
  const { signIn, register, verifyEmail } = useAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login')
  const [form, setForm] = useState({ fullName: '', email: '', memberNo: '', phone: '', password: '', confirm: '', code: '' })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The address the code was sent to, as the server stored it.
  const [verifyFor, setVerifyFor] = useState('')

  const toVerify = (email: string, message: string) => {
    setVerifyFor(email)
    setForm((f) => ({ ...f, code: '' }))
    setNotice(message)
    setMode('verify')
  }

  const resend = async () => {
    setError(null)
    try {
      await api.resendVerification(verifyFor)
      setNotice(`If the account still needs verifying, a new code is on its way to ${verifyFor}. You can ask for another after a minute.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setError(null)
    if (mode === 'register' && form.password !== form.confirm) return setError('The passwords do not match.')
    setBusy(true)
    try {
      if (mode === 'login') await signIn(form.email, form.password)
      else if (mode === 'verify') await verifyEmail(verifyFor, form.code)
      else {
        const r = await register({
          fullName: form.fullName,
          email: form.email,
          memberNo: form.memberNo,
          phone: form.phone || undefined,
          password: form.password,
        })
        toVerify(
          r.email,
          r.emailSent
            ? `We sent a 6-digit code to ${r.email}. Enter it below. Check your Spam folder if you can't find it.`
            : `Your account was created, but the email didn't go out. Tap "Send a new code" in a minute.`,
        )
      }
    } catch (e) {
      if (mode === 'login' && e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        toVerify(form.email.trim().toLowerCase(), 'Verify your email first. Enter the code we sent you, or ask for a new one.')
      } else setError((e as Error).message)
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
              {mode === 'login' ? 'Sign in' : mode === 'verify' ? 'Verify your email' : 'Create your member account'}
            </Text>
            <ErrorText text={error} />
            {mode === 'verify' ? (
              <>
                {notice ? <Text style={{ color: colors.text, marginBottom: 12, lineHeight: 20 }}>{notice}</Text> : null}
                <Field
                  label="Verification code"
                  value={form.code}
                  onChangeText={(v) => set('code')(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="6 digits"
                  hint="The code expires after 15 minutes."
                />
                <Button title="Verify and continue" onPress={submit} loading={busy} disabled={form.code.length !== 6} />
                <View style={{ height: 8 }} />
                <Button variant="ghost" title="Send a new code" onPress={resend} />
                <Button
                  variant="ghost"
                  title="Back to sign in"
                  onPress={() => {
                    setError(null)
                    setMode('login')
                  }}
                />
              </>
            ) : (
              <>
                {mode === 'register' ? (
                  <>
                    <Field
                      label="Full name"
                      value={form.fullName}
                      onChangeText={set('fullName')}
                      placeholder="Juan D. Dela Cruz"
                      autoComplete="name"
                    />
                    <Field
                      label="UDEI member number"
                      value={form.memberNo}
                      onChangeText={set('memberNo')}
                      placeholder="e.g. 42"
                      hint="The office checks this against the member list before your first loan."
                    />
                    <Field
                      label="Mobile number (optional)"
                      value={form.phone}
                      onChangeText={set('phone')}
                      keyboardType="phone-pad"
                      placeholder="09XX XXX XXXX"
                    />
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
                {mode === 'register' ? (
                  <Field label="Confirm password" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
                ) : null}
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
              </>
            )}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
