import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
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

/** A password field with an eye button that shows or hides what was typed. */
export function PasswordField({ label, hint, ...props }: Omit<TextInputProps, 'secureTextEntry'> & { label: string; hint?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor="#9AA8A0"
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, { paddingRight: 48 }]}
          {...props}
          secureTextEntry={!shown}
        />
        <Pressable
          onPress={() => setShown((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          hitSlop={8}
          style={{ position: 'absolute', right: 4, padding: 10 }}
        >
          <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
        </Pressable>
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  )
}

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  wide,
}: {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
  /** Two choices per row (for longer labels and hints). */
  wide?: boolean
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[s.chip, wide && { flexBasis: '45%', paddingHorizontal: 10 }, on && s.chipOn]}
            >
              <Text style={[s.chipText, wide && { textAlign: 'center' }, on && { color: '#fff' }]}>{o.label}</Text>
              {o.hint ? <Text style={{ fontSize: 11, marginTop: 2, textAlign: 'center', color: on ? '#DDF3E7' : colors.muted }}>{o.hint}</Text> : null}
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

/**
 * Long lists on a phone: the first `step` rows, then a "Show 10 more" button (no page numbers).
 * Starts again from the first `step` when the list's length changes (e.g. after a refresh).
 */
export function useShowMore<T>(rows: readonly T[], step = 10) {
  const [shown, setShown] = useState({ count: step, forLength: rows.length })
  const count = shown.forLength === rows.length ? shown.count : step
  return {
    visible: rows.slice(0, count),
    total: rows.length,
    step,
    more: () => setShown({ count: count + step, forLength: rows.length }),
  }
}

/** The button under a useShowMore list: "Show 10 more (24 of 57)". Hidden once everything shows. */
export function ShowMore({ list }: { list: { visible: readonly unknown[]; total: number; step: number; more: () => void } }) {
  if (list.visible.length >= list.total) return null
  const next = Math.min(list.step, list.total - list.visible.length)
  return (
    <Pressable accessibilityRole="button" onPress={list.more} style={({ pressed }) => [s.showMore, pressed && { opacity: 0.7 }]}>
      <Text style={{ color: colors.primary, fontWeight: '700' }}>
        Show {next} more ({list.visible.length} of {list.total})
      </Text>
    </Pressable>
  )
}

/** Longer how-it-works text behind a row that opens it, closed by default (the web's HowItWorks). */
export function HowItWorks({ children, label = 'How this works' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={{ marginTop: 4 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
        <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 12 }}>{label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </Pressable>
      {open ? <View style={{ marginTop: 2 }}>{children}</View> : null}
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
  showMore: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: 10, marginBottom: 12 },
})

// Rendered from client/src/components/mascot/owl.ts (256 x 256), with closed-eye frames for blinking.
const kuwi = {
  happy: require('../assets/kuwi-happy.png'),
  neutral: require('../assets/kuwi-neutral.png'),
  concerned: require('../assets/kuwi-concerned.png'),
}
const kuwiBlink: Partial<Record<keyof typeof kuwi, number>> = {
  neutral: require('../assets/kuwi-neutral-blink.png'),
  concerned: require('../assets/kuwi-concerned-blink.png'),
}

/**
 * Kuwi the owl, alive: pops in, bobs (happy: hops), blinks (neutral, concerned) and jumps when
 * tapped. With Reduce Motion on she only bobs slowly and blinks (no pop, hop or jump), so she still
 * looks alive on phones that have it on. Timers and loops stop on unmount.
 */
export function Kuwi({ mood = 'neutral', size = 60, label = true }: { mood?: keyof typeof kuwi; size?: number; label?: boolean }) {
  const [still, setStill] = useState(true)
  const [blink, setBlink] = useState(false)
  const [scale] = useState(() => new Animated.Value(0.4))
  const [lift] = useState(() => new Animated.Value(0))
  const [jump] = useState(() => new Animated.Value(0))

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => alive && setStill(reduce)).catch(() => alive && setStill(false))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) => setStill(reduce))
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  useEffect(() => {
    // still = Reduce Motion: no pop-in and no hop, just the slow bob and the blink.
    scale.setValue(still ? 1 : 0.4)
    const bob = still ? 2200 : 1600
    const pop = Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true })
    const loop = Animated.loop(
      mood === 'happy' && !still
        ? // A small hop every 2.4 s.
          Animated.sequence([
            Animated.delay(1700),
            Animated.timing(lift, { toValue: -6, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(lift, { toValue: 0, duration: 480, easing: Easing.bounce, useNativeDriver: true }),
          ])
        : // A gentle bob over 3.2 s.
          Animated.sequence([
            Animated.timing(lift, { toValue: -3, duration: bob, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(lift, { toValue: 0, duration: bob, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
    )
    if (!still) pop.start()
    loop.start()
    // Blink every ~4.5 s for 140 ms (her happy eyes are already closed arcs).
    let open: ReturnType<typeof setTimeout> | undefined
    const blinker = kuwiBlink[mood]
      ? setInterval(() => {
          setBlink(true)
          open = setTimeout(() => setBlink(false), 140)
        }, 4500)
      : undefined
    return () => {
      pop.stop()
      loop.stop()
      if (blinker) clearInterval(blinker)
      if (open) clearTimeout(open)
      setBlink(false)
    }
  }, [mood, still, scale, lift])

  const tap = () => {
    if (still) return
    jump.setValue(0)
    Animated.sequence([
      Animated.timing(jump, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(jump, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start()
  }

  const jumpY = jump.interpolate({ inputRange: [0, 1], outputRange: [0, -10] })
  const rotate = jump.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] })
  return (
    <Pressable onPress={tap} accessible={label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label ? `Kuwi the owl, ${mood}` : undefined}
      importantForAccessibility={label ? 'auto' : 'no-hide-descendants'}>
      <Animated.Image
        source={blink && kuwiBlink[mood] ? kuwiBlink[mood] : kuwi[mood]}
        style={{ width: size, height: size, transform: [{ translateY: Animated.add(lift, jumpY) }, { scale }, { rotate }] }}
      />
    </Pressable>
  )
}

/** Kuwi the owl explaining something in a speech bubble (the same owl as on the website). */
export function MascotSays({ mood = 'neutral', title, children }: { mood?: keyof typeof kuwi; title?: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
      <View style={{ alignItems: 'center' }}>
        {/* The "KUWI" label under her names her, so the image itself isn't read out too. */}
        <Kuwi mood={mood} size={60} label={false} />
        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 }}>KUWI</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 10 }}>
        {title ? <Text style={{ fontWeight: '700', color: colors.text, marginBottom: 2 }}>{title}</Text> : null}
        {children}
      </View>
    </View>
  )
}

// Kuwi's callouts, as on the web: a left border, a light fill and a coloured heading, so the
// reasons (red), the tips (amber) and what's going well (green) read as separate boxes.
const kuwiBoxTones = {
  against: { border: '#f87171', bg: '#fef2f2', head: '#991b1b', text: '#450a0a', mark: '✕' },
  tips: { border: '#fbbf24', bg: '#fffbeb', head: '#92400e', text: '#451a03', mark: '→' },
  // "Doing well": the parts of the member score at 80 or more.
  favor: { border: '#34d399', bg: '#ecfdf5', head: '#065f46', text: '#022c22', mark: '✓' },
} as const

export function KuwiBox({ kind, title, items }: { kind: keyof typeof kuwiBoxTones; title: string; items: string[] }) {
  const t = kuwiBoxTones[kind]
  if (!items.length) return null
  return (
    <View accessibilityRole="summary" accessibilityLabel={title}
      style={{ marginTop: 8, borderLeftWidth: 4, borderLeftColor: t.border, backgroundColor: t.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
      <Text style={{ color: t.head, fontWeight: '800', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <Text style={{ color: t.border, fontWeight: '800' }}>{t.mark}</Text>
          <Text style={{ color: t.text, flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  )
}
