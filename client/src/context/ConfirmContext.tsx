import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from '../components/Modal'

export type ConfirmOptions = {
  title: string
  /** What will change, in plain words. */
  message: ReactNode
  confirmLabel?: string
  /** Red button, for actions that are hard to undo (denials, voids, role changes). */
  danger?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * The "Are you sure?" dialog before any change. Call `await confirm({ ... })`; it resolves true only
 * when the person presses the confirm button.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal title={options.title} open onClose={() => close(false)}>
          <div className="flex gap-3">
            <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${options.danger ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="min-w-0 space-y-2 text-sm text-brand-800">{options.message}</div>
          </div>
          <p className="mt-4 text-xs text-brand-500">This action is recorded in the audit log.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => close(false)}>Cancel</button>
            <button
              type="button"
              autoFocus
              className={options.danger ? 'btn bg-red-700 text-white hover:bg-red-800' : 'btn-primary'}
              onClick={() => close(true)}
            >
              {options.confirmLabel ?? 'Yes, continue'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}
