import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'

// Signed out after 30 minutes without using the page (shared office computers), or when the
// 8-hour session ends. A minute before either, the person is asked whether to stay signed in.
const IDLE_MS = 30 * 60 * 1000
const WARN_MS = 60 * 1000
const ACTIVITY_KEY = 'udei.lastActivity'

const readActivity = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0
  } catch {
    return 0
  }
}
const writeActivity = (t: number) => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(t))
  } catch {
    /* other tabs just won't see it */
  }
}

export default function SessionTimeout() {
  const { session, expiresAt, logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [error, setError] = useState('')
  // Set when the session starts (the effect below).
  const last = useRef(0)
  const warning = useRef(false)

  // Any use of the page counts, in this tab or another one (shared through localStorage).
  useEffect(() => {
    if (!session) return
    last.current = Date.now()
    writeActivity(last.current)
    const onActivity = () => {
      if (warning.current) return // once warned, only the button keeps the session
      const now = Date.now()
      if (now - last.current > 5000) writeActivity(now)
      last.current = now
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, onActivity))
  }, [session])

  useEffect(() => {
    if (!session) return
    const tick = () => {
      const lastActive = Math.max(last.current, readActivity())
      const idleEnds = lastActive + IDLE_MS
      const tokenEnds = expiresAt ? new Date(expiresAt).getTime() : Infinity
      const left = Math.min(idleEnds, tokenEnds) - Date.now()
      if (left <= 0) {
        warning.current = false
        setSecondsLeft(null)
        void logout().then(() => navigate('/login', { replace: true, state: { signedOut: tokenEnds <= idleEnds ? 'expired' : 'idle' } }))
      } else if (left <= WARN_MS) {
        warning.current = true
        setSecondsLeft(Math.ceil(left / 1000))
      } else if (warning.current) {
        // Activity in another tab moved the deadline.
        warning.current = false
        setSecondsLeft(null)
      }
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session, expiresAt, logout, navigate])

  const stay = async () => {
    setError('')
    try {
      // Renew the session itself when it ends within 10 minutes; otherwise counting activity is enough.
      if (expiresAt && new Date(expiresAt).getTime() - Date.now() < 10 * 60 * 1000) await refresh()
      last.current = Date.now()
      writeActivity(last.current)
      warning.current = false
      setSecondsLeft(null)
    } catch {
      setError('Could not renew your session. Save your work and sign in again.')
    }
  }

  const signOutNow = async () => {
    warning.current = false
    setSecondsLeft(null)
    await logout()
    navigate('/login', { replace: true })
  }

  if (secondsLeft === null) return null
  return (
    <Modal title="Still there?" open onClose={() => void stay()}>
      <div className="flex gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-2 text-sm text-brand-800">
          <p>For your security you'll be signed out in <b className="text-lg tabular-nums">{secondsLeft}</b> seconds.</p>
          <p>Anything you were typing on the loan form is kept, but other unsaved changes may be lost.</p>
          {error && <p className="text-red-700">{error}</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => void signOutNow()}>Sign out now</button>
        <button type="button" className="btn-primary" autoFocus onClick={() => void stay()}>Stay signed in</button>
      </div>
    </Modal>
  )
}
