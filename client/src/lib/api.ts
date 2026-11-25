const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Opens a stored file (a document or a signed statement) in a new tab. The tab is opened first,
 * so the browser doesn't block it as a pop-up.
 */
export async function openFile(path: string) {
  const tab = window.open('', '_blank')
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || 'Could not open the file.', res.status)
    const url = URL.createObjectURL(await res.blob())
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' })
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code)
  return data as T
}
