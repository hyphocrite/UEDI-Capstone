import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { api, type Application, type Loan } from './src/api'
import { AuthProvider, useAuth } from './src/auth'
import { scheduleDueReminders } from './src/reminders'
import { colors } from './src/theme'
import AuthScreen from './src/screens/AuthScreen'
import HomeScreen from './src/screens/HomeScreen'
import ApplyScreen from './src/screens/ApplyScreen'
import LoansScreen from './src/screens/LoansScreen'
import LoanDetailScreen from './src/screens/LoanDetailScreen'
import ProfileScreen from './src/screens/ProfileScreen'

type Tab = 'home' | 'apply' | 'loans' | 'account'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'apply', label: 'Apply', icon: '+' },
  { key: 'loans', label: 'My loans', icon: '₱' },
  { key: 'account', label: 'Account', icon: '◉' },
]

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={{ flex: 0, backgroundColor: colors.header }} />
        <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
          <Root />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

function Root() {
  const { session, ready } = useAuth()
  if (!ready) return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
  return session ? <MemberHome key={session.id} /> : <AuthScreen />
}

function MemberHome() {
  const [tab, setTab] = useState<Tab>('home')
  const [openLoan, setOpenLoan] = useState<string | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
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

  if (openLoan) return <LoanDetailScreen id={openLoan} onBack={() => setOpenLoan(null)} />

  const shared = { loans, applications, loading, onRefresh: refresh, onOpenLoan: setOpenLoan }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'home' ? <HomeScreen {...shared} onApply={() => setTab('apply')} /> : null}
        {tab === 'apply' ? (
          <ApplyScreen
            onDone={() => {
              refresh()
              setTab('loans')
            }}
          />
        ) : null}
        {tab === 'loans' ? <LoansScreen {...shared} /> : null}
        {tab === 'account' ? <ProfileScreen reminders={reminders} /> : null}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#DDE5DF', backgroundColor: '#fff' }}>
        {TABS.map((t) => {
          const on = t.key === tab
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 20, color: on ? colors.accent : '#9AA8A0' }}>{t.icon}</Text>
              <Text style={{ fontSize: 12, marginTop: 2, color: on ? colors.primary : '#9AA8A0', fontWeight: on ? '700' : '500' }}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
