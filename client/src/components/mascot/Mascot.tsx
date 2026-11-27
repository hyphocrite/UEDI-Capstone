import type { ReactNode } from 'react'
import { ArrowRight, CircleCheck, CircleX, Lightbulb } from 'lucide-react'
import { MASCOT_NAME, owlSvg } from './owl'
import type { Mood } from './owl'

const svgs: Record<Mood, string> = { happy: owlSvg('happy'), neutral: owlSvg('neutral'), concerned: owlSvg('concerned') }

/**
 * Kuwi the owl. The SVG is our own static drawing, so setting it as HTML is safe. kuwi-pop (index.css)
 * pops her in and makes her jump on hover or tap; her idle moves come from the .kuwi rules.
 * `hidden`: when a visible "KUWI" label sits next to her, so screen readers don't read her twice.
 */
export function Mascot({ mood = 'neutral', className = 'h-16 w-16', hidden = false }: { mood?: Mood; className?: string; hidden?: boolean }) {
  return (
    <span aria-hidden={hidden || undefined} className={`kuwi-pop inline-block shrink-0 [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svgs[mood] }} />
  )
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
        <Mascot hidden mood={mood} className={`h-14 w-14 sm:h-16 sm:w-16 ${tone === 'dark' ? 'rounded-full bg-brand-50 p-0.5' : ''}`} />
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

/**
 * Kuwi's reasons in a bordered callout, the same shape as KuwiTips, so "against" (red),
 * "in favor" (green) and the tips (amber) read as three separate boxes. A cross or a check on
 * every line too, not only the colour. h-full keeps the two boxes equal in a row.
 */
const reasonTones = {
  against: {
    light: { box: 'border-red-400 bg-red-50 text-red-950', head: 'text-red-800', icon: 'text-red-600', empty: 'text-red-900/70' },
    dark: { box: 'border-red-300 bg-red-300/15 text-red-50', head: 'text-red-200', icon: 'text-red-300', empty: 'text-red-100/80' },
  },
  favor: {
    light: { box: 'border-emerald-400 bg-emerald-50 text-emerald-950', head: 'text-emerald-800', icon: 'text-emerald-600', empty: 'text-emerald-900/70' },
    dark: { box: 'border-emerald-300 bg-emerald-300/15 text-emerald-50', head: 'text-emerald-200', icon: 'text-emerald-300', empty: 'text-emerald-100/80' },
  },
} as const

export function KuwiReasons({ kind, items, tone = 'light', title }: { kind: 'against' | 'favor'; items: string[]; tone?: 'light' | 'dark'; title?: string }) {
  const Icon = kind === 'against' ? CircleX : CircleCheck
  const t = reasonTones[kind][tone]
  const heading = title ?? (kind === 'against' ? 'Against' : 'In favor')
  return (
    <div className={`h-full rounded-lg border-l-4 px-3 py-2.5 ${t.box}`} role="note" aria-label={heading}>
      <p className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${t.head}`}>
        <Icon className="h-4 w-4" /> {heading}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.length ? items.map((text) => (
          <li key={text} className="flex gap-2"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} /> <span>{text}</span></li>
        )) : <li className={t.empty}>Nothing stood out.</li>}
      </ul>
    </div>
  )
}

/**
 * Kuwi's recommendations (what would help), set apart from the reasons in an amber callout with a
 * lightbulb, so it reads as advice and not as part of the score.
 */
export function KuwiTips({ tips, title = `${MASCOT_NAME} recommends`, tone = 'light' }: { tips: string[]; title?: string; tone?: 'light' | 'dark' }) {
  if (!tips.length) return null
  const box = tone === 'dark' ? 'border-amber-300 bg-amber-300/15 text-amber-50' : 'border-amber-400 bg-amber-50 text-amber-950'
  const head = tone === 'dark' ? 'text-amber-200' : 'text-amber-800'
  return (
    <div className={`mt-3 rounded-lg border-l-4 px-3 py-2.5 ${box}`} role="note" aria-label={title}>
      <p className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${head}`}>
        <Lightbulb className="h-4 w-4" /> {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {tips.map((t) => (
          <li key={t} className="flex gap-2"><ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 ${head}`} /> <span>{t}</span></li>
        ))}
      </ul>
    </div>
  )
}
