import { useEffect, useRef, useState } from 'react'
import { booksFromLedger } from './applicationForm'
import type { Form, LedgerState } from './applicationForm'
import { api } from '../../lib/api'
import type { MemberBalances } from '../../lib/loans'

const emptyBooks: Partial<Form> = {
  longTermBalance: '0',
  longTermDueDate: '',
  shortTermBalance: '0',
  shortTermDueDate: '',
  monthlyPayment: '0',
}

/**
 * Looks up the member's balances in the ledger whenever the member ID changes (picked or typed)
 * and fills the Bookkeeper section through `fill`. Returns where the figures come from.
 */
export function useMemberLedger(memberId: string, fill: (patch: Partial<Form>) => void): LedgerState {
  const id = memberId.trim()
  const [result, setResult] = useState<{ id: string; ledger: LedgerState }>({ id: '', ledger: { status: 'none' } })
  const fillRef = useRef(fill)
  const wasLedger = useRef(false)
  useEffect(() => {
    fillRef.current = fill
  })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    // Wait for typing to pause before asking the server.
    const timer = setTimeout(() => {
      api<{ balances: MemberBalances }>(`/api/loans/balances?memberId=${encodeURIComponent(id)}`)
        .then(({ balances }) => {
          if (cancelled) return
          if (balances.hasLoans) {
            fillRef.current(booksFromLedger(balances))
            wasLedger.current = true
            setResult({ id, ledger: { status: 'ledger', balances } })
          } else {
            // Don't leave another member's ledger figures behind in fields that are now editable.
            if (wasLedger.current) fillRef.current(emptyBooks)
            wasLedger.current = false
            setResult({ id, ledger: { status: 'none' } })
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setResult({ id, ledger: { status: 'error', message: err instanceof Error ? err.message : 'lookup failed' } })
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id])

  if (!id) return { status: 'none' }
  if (result.id !== id) return { status: 'loading', memberId: id }
  return result.ledger
}
