import { useEffect, useState } from 'react'
import { api } from './api'
import type { MyScore } from './members'

export type MyScoreState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: MyScore }

/** The signed-in member's own member score (GET /api/me/score). Pass false to skip it (staff). */
export function useMyScore(enabled = true): MyScoreState {
  const [state, setState] = useState<MyScoreState>({ status: 'loading' })
  useEffect(() => {
    if (!enabled) return
    let live = true
    api<MyScore>('/api/me/score')
      .then((data) => live && setState({ status: 'ok', data }))
      .catch((err: unknown) => live && setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load your score.' }))
    return () => {
      live = false
    }
  }, [enabled])
  return state
}
