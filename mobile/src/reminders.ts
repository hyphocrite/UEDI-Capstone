import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import type { Loan } from './api'
import { centavos, date } from './format'

// Due-date reminders are local notifications scheduled on the phone, 3 days before and on the
// due date of each unpaid installment, so they work without a push server.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

const AT_HOUR = 8 // 8:00 AM on the day

function at8(d: string, daysBefore: number) {
  const when = new Date(d)
  when.setDate(when.getDate() - daysBefore)
  when.setHours(AT_HOUR, 0, 0, 0)
  return when
}

/** Replaces all scheduled reminders with ones for the loans given. Returns how many were set. */
export async function scheduleDueReminders(loans: Loan[]): Promise<number> {
  if (Platform.OS === 'web') return 0
  const perm = await Notifications.requestPermissionsAsync()
  if (!perm.granted) return 0
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('due-dates', {
      name: 'Loan due dates',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }
  await Notifications.cancelAllScheduledNotificationsAsync()

  const now = Date.now()
  let count = 0
  for (const loan of loans.filter((l) => l.status === 'active')) {
    // The next few unpaid installments are enough; the list refreshes each time the app opens.
    const open = loan.schedule.filter((x) => x.paid < x.totalDue).slice(0, 3)
    for (const inst of open) {
      const amount = centavos(inst.totalDue - inst.paid)
      const plan = [
        { when: at8(inst.dueDate, 3), body: `${amount} for loan ${loan.loanNo} is due on ${date(inst.dueDate)}.` },
        { when: at8(inst.dueDate, 0), body: `${amount} for loan ${loan.loanNo} is due today.` },
      ]
      for (const p of plan) {
        if (p.when.getTime() <= now) continue
        await Notifications.scheduleNotificationAsync({
          content: { title: 'UDEI loan payment', body: p.body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.when, channelId: 'due-dates' },
        })
        count++
      }
    }
  }
  return count
}

export async function clearReminders() {
  if (Platform.OS !== 'web') await Notifications.cancelAllScheduledNotificationsAsync()
}
