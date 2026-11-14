import type { ReactNode } from 'react'
import { MASCOT_NAME, owlSvg } from './owl'
import type { Mood } from './owl'

const svgs: Record<Mood, string> = { happy: owlSvg('happy'), neutral: owlSvg('neutral'), concerned: owlSvg('concerned') }

/** Kuwi the owl. The SVG is our own static drawing, so setting it as HTML is safe. */
export function Mascot({ mood = 'neutral', className = 'h-16 w-16' }: { mood?: Mood; className?: string }) {
  return <span className={`inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: svgs[mood] }} />
}

/**
 * Kuwi explaining something in a speech bubble: the model's reasons (SHAP) in plain words.
 * `tone` "dark" is for the dark-green ML panel.
 */
export function MascotSays({ mood = 'neutral', title, tone = 'light', children }: { mood?: Mood; title?: ReactNode; tone?: 'light' | 'dark'; children: ReactNode }) {
  const bubble = tone === 'dark' ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-white text-ink ring-1 ring-brand-100 shadow-sm'
  const tail = tone === 'dark' ? 'bg-[#1d4f38] ring-1 ring-white/15' : 'bg-white ring-1 ring-brand-100'
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <Mascot mood={mood} className={`h-14 w-14 sm:h-16 sm:w-16 ${tone === 'dark' ? 'rounded-full bg-brand-50 p-1' : ''}`} />
        <span className={`mt-0.5 text-[10px] font-semibold tracking-wide uppercase ${tone === 'dark' ? 'text-brand-200' : 'text-brand-500'}`}>{MASCOT_NAME}</span>
      </div>
      <div className={`relative min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm ${bubble}`}>
        {/* The bubble's tail, pointing at Kuwi. */}
        <span aria-hidden className={`absolute top-5 -left-1.5 h-3 w-3 rotate-45 [clip-path:polygon(0_0,0_100%,100%_100%)] ${tail}`} />
        {title && <p className="mb-1 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
