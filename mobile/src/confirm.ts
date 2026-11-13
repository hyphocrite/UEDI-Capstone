import { Alert, Platform } from 'react-native'

/** "Are you sure?" before a change. Resolves true only when the member taps the confirm button. */
export function confirmAction(title: string, message: string, confirmLabel = 'Yes, continue'): Promise<boolean> {
  // Alert does nothing on the web preview (npx expo start --web), so use the browser's dialog there.
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`))
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })
}
