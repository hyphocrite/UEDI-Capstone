import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { colors, radius } from './theme'

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>
}

export function Button({
  title,
  onPress,
  loading,
  variant = 'primary',
  disabled,
}: {
  title: string
  onPress: () => void
  loading?: boolean
  variant?: 'primary' | 'outline' | 'ghost'
  disabled?: boolean
}) {
  const off = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, s[`btn_${variant}`], (pressed || off) && { opacity: 0.7 }]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text style={[s.btnText, variant !== 'primary' && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  )
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9AA8A0" style={s.input} {...props} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  )
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}
    >
      <View style={[s.box, value && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
        {value ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>✓</Text> : null}
      </View>
      <Text style={{ flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 }}>{label}</Text>
    </Pressable>
  )
}

const BADGE = {
  green: { bg: colors.accentSoft, fg: '#065F46' },
  amber: { bg: colors.warnSoft, fg: colors.warn },
  red: { bg: colors.dangerSoft, fg: colors.danger },
  gray: { bg: '#E9EEEA', fg: colors.muted },
}

export function Badge({ text, tone }: { text: string; tone: keyof typeof BADGE }) {
  return (
    <View style={[s.badge, { backgroundColor: BADGE[tone].bg }]}>
      <Text style={{ color: BADGE[tone].fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  )
}

export function ErrorText({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <View style={s.error} accessibilityRole="alert">
      <Text style={{ color: colors.danger }}>{text}</Text>
    </View>
  )
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  )
}

export function Empty({ text }: { text: string }) {
  return <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 24 }}>{text}</Text>
}

export const s = StyleSheet.create({
  header: {
    backgroundColor: colors.header,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: '#A7D7BF', fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  btn: { borderRadius: radius, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btn_primary: { backgroundColor: colors.primary },
  btn_outline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: '#fff' },
  btn_ghost: { backgroundColor: 'transparent' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  label: { color: colors.text, fontWeight: '600', marginBottom: 6, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.text,
  },
  chip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: '#fff',
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  error: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 6 },
})
