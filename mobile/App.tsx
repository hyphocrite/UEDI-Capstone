import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Ionicons from '@expo/vector-icons/Ionicons'
import { api, type Application, type CoMakerPortal, type Loan, type MyScore } from './src/api'
import { AuthProvider, useAuth } from './src/auth'
import { scheduleDueReminders } from './src/reminders'
import { colors } from './src/theme'
import { ConsentScreen } from './src/screens/PrivacyNotice'
import AuthScreen from './src/screens/AuthScreen'
import HomeScreen from './src/screens/HomeScreen'
import ApplyScreen from './src/screens/ApplyScreen'
import LoansScreen from './src/screens/LoansScreen'
import LoanDetailScreen from './src/screens/LoanDetailScreen'
import CoMakerScreen from './src/screens/CoMakerScreen'
import ProfileScreen from './src/screens/ProfileScreen'

type Tab = 'loans' | 'apply' | 'home' | 'comaker' | 'profile'
type IconName = keyof typeof Ionicons.glyphMap

// Loans · Apply · ( Home ) · Co-maker · Profile, the same order as the web app's tab bar.
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'loans', label: 'Assistance', icon: 'cash-outline' },
  { key: 'apply', label: 'Apply', icon: 'add-circle-outline' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'comaker', label: 'Co-maker', icon: 'people-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-circle-outline' },
]

/** Tablets: content centred at this width, tab labels beside the icons. */
const TABLET = 768
const CONTENT_MAX = 720

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={{ flex: 0, backgroundColor: colors.header }} />
        {/* The bottom inset is handled by the tab bar, so it stays white down to the edge. */}
        <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
          <Root />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

function Root() {
  const { session, ready, updateSession } = useAuth()
  if (!ready) return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
  if (session?.needsConsent) return <ConsentScreen onAgreed={updateSession} />
  return session ? <MemberHome key={session.id} /> : <SignedOut />
}

/** The sign-in screens keep their own bottom inset (there is no tab bar). */
function SignedOut() {
  const { bottom } = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, paddingBottom: bottom }}>
      <AuthScreen />
    </View>
  )
}

function MemberHome() {
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('home')
  const [openLoan, setOpenLoan] = useState<string | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [score, setScore] = useState<MyScore | null>(null)
  const [coMaker, setCoMaker] = useState<CoMakerPortal | null>(null)
  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<number | null>(null)
  const { width } = useWindowDimensions()
  const { bottom } = useSafeAreaInsets()
  const tablet = width >= TABLET

  const refresh = useCallback(async () => {
    setLoading(true)
    // The score and co-maker portal load on their own, so a failure there doesn't hide the loans.
    api.myScore().then(setScore, () => {})
    api.coMaker().then(setCoMaker, () => {})
    try {
      const [l, a] = await Promise.all([api.loans(), api.applications()])
      setLoans(l.loans)
      setApplications(a.applications)
      scheduleDueReminders(l.loans).then(setReminders, () => setReminders(0))
    } catch {
      /* keep what we had; pull to refresh again */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Red dots: a loan past due, and co-maker requests waiting or alerts.
  const dots: Partial<Record<Tab, boolean>> = {
    loans: loans.some((l) => l.status === 'active' && l.pastDue),
    comaker: !!coMaker && (coMaker.alerts.length > 0 || coMaker.requests.some((r) => r.status === 'pending' && r.myStatus === 'pending')),
  }

  if (openLoan) return <LoanDetailScreen id={openLoan} onBack={() => setOpenLoan(null)} />

  const shared = { loans, applications, loading, onRefresh: refresh, onOpenLoan: setOpenLoan }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, width: '100%', maxWidth: tablet ? CONTENT_MAX : undefined, alignSelf: 'center' }}>
        {tab === 'home' ? <HomeScreen {...shared} score={score} onApply={() => setTab('apply')} /> : null}
        {tab === 'apply' ? (
          <ApplyScreen
            onDone={() => {
              refresh()
              setTab('loans')
            }}
          />
        ) : null}
        {tab === 'loans' ? <LoansScreen {...shared} /> : null}
        {tab === 'comaker' ? <CoMakerScreen onChanged={refresh} memberId={session?.memberId ?? session?.memberNo} /> : null}
        {tab === 'profile' ? <ProfileScreen reminders={reminders} score={score} /> : null}
      </View>

      <View
        accessibilityRole="tablist"
        style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff', paddingBottom: bottom }}
      >
        {TABS.map((t) => {
          const on = t.key === tab
          const color = on ? colors.accent : '#9AA8A0'
          if (t.key === 'home') {
            // Home: a raised round button in the middle.
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel="Home"
                style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 28, marginTop: -24, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on ? colors.primary : '#15613F', borderWidth: 4, borderColor: '#fff',
                  shadowColor: '#0B422A', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
                }}>
                  <Ionicons name={t.icon} size={26} color="#fff" />
                </View>
                <Text style={{ fontSize: 12, marginTop: 2, color: on ? colors.primary : '#9AA8A0', fontWeight: on ? '700' : '500' }}>{t.label}</Text>
              </Pressable>
            )
          }
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, flexDirection: tablet ? 'row' : 'column', gap: tablet ? 8 : 2 }}>
              <View>
                <Ionicons name={t.icon} size={22} color={color} />
                {dots[t.key] ? (
                  <View accessibilityLabel={t.key === 'loans' ? 'A payment is past due' : 'Co-maker requests or alerts'}
                    style={{ position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#fff' }} />
                ) : null}
              </View>
              <Text style={{ fontSize: 12, color: on ? colors.primary : '#9AA8A0', fontWeight: on ? '700' : '500' }}>{t.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
