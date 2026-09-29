import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = { title: string; open: boolean; onClose: () => void; children: ReactNode }

export default function Modal({ title, open, onClose, children }: Props) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-800">{title}</h2>
          <button className="rounded p-1 text-brand-600 hover:bg-brand-50" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
