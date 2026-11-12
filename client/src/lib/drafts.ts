// Unsent form drafts kept in this browser, so a reload doesn't lose what was typed. They hold
// members' personal and salary details, so each account has its own and logging out clears them all.

const PREFIX = 'udei.draft.'

type Saved<T> = { savedAt: string; values: Partial<T> }

export const draftKey = (form: string, userId: string) => `${PREFIX}${form}.${userId}`

/** The saved draft, or null when there is none or storage can't be read. */
export function loadDraft<T>(key: string): Saved<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Saved<T>) : null
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, values: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), values }))
  } catch {
    /* storage full or blocked: the form still works, it just isn't kept */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Removes every draft in this browser. Called on logout. */
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
