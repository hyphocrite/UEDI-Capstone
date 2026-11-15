import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** A password box with an eye button that shows or hides what was typed. */
export default function PasswordInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOff : Eye
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className={`input pr-11 ${className}`} />
      <button type="button" onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} title={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-brand-500 transition hover:text-brand-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
        <Icon className="h-4 w-4" />
      </button>
    </div>
  )
}
