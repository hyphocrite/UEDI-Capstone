import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// The session token lives in the phone's secure storage (Keychain / Keystore).
// On web (only used for quick previews) it falls back to localStorage.
const KEY = 'udei.token'

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  }
  return SecureStore.getItemAsync(KEY)
}

export async function saveToken(token: string | null) {
  if (Platform.OS === 'web') {
    try {
      if (token) localStorage.setItem(KEY, token)
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode */
    }
    return
  }
  if (token) await SecureStore.setItemAsync(KEY, token)
  else await SecureStore.deleteItemAsync(KEY)
}
