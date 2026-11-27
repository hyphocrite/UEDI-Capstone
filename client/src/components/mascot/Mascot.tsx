import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, ChevronDown, CircleCheck, CircleX, Lightbulb } from 'lucide-react'
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

/** Open on tablets and up, closed on phones, unless the viewer chose before (remembered per `storageKey`). */
function useKuwiOpen(storageKey: string | undefined) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = storageKey ? localStorage.getItem(`kuwi-open:${storageKey}`) : null
      if (saved === '1' || saved === '0') return saved === '1'
    } catch { /* storage blocked: use the default */ }
    return typeof window === 'undefined' || window.matchMedia('(min-width: 40rem)').matches
  })
  const toggle = () =>
    setOpen((o) => {
      try { if (storageKey) localStorage.setItem(`kuwi-open:${storageKey}`, o ? '0' : '1') } catch { /* not remembered */ }
      return !o
    })
  return [open, toggle] as const
}

/**
 * Kuwi explaining something in a speech bubble: the model's reasons (SHAP) in plain words.
 * `tone` "dark" is for the dark-green ML panel.
 *
 * Phones: Kuwi sits above a full-width bubble (beside it, the text was squeezed to a few words a
 * line). Tablets and up: Kuwi beside the bubble.
 * `collapsible`: the title becomes a Show/Hide button and the rest folds away with an animation;
 * open on tablets and up, closed on phones, and the viewer's choice is remembered by `storageKey`.
 */
export function MascotSays({ mood = 'neutral', title, tone = 'light', collapsible = false, storageKey, children }: {
  mood?: Mood
  title?: ReactNode
  tone?: 'light' | 'dark'
  collapsible?: boolean
  storageKey?: string
  children: ReactNode
}) {
  const [openState, toggle] = useKuwiOpen(collapsible ? storageKey : undefined)
  const open = !collapsible || openState
  const bodyId = useId()
  const dark = tone === 'dark'
  const bubble = dark ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-white text-ink ring-1 ring-brand-100 shadow-sm'
  const tail = dark ? 'bg-[#1d4f38] ring-1 ring-white/15' : 'bg-white ring-1 ring-brand-100'
  const muted = dark ? 'text-brand-200' : 'text-brand-500'
  return (
    <div className="kuwi-says flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3" data-open={open}>
      <div className="flex items-center gap-2 sm:flex-col sm:gap-0">
        <Mascot hidden mood={mood} className={`h-12 w-12 sm:h-16 sm:w-16 ${dark ? 'rounded-full bg-brand-50 p-0.5' : ''}`} />
        <span className={`text-[10px] font-semibold tracking-wide uppercase sm:mt-0.5 ${muted}`}>{MASCOT_NAME}</span>
      </div>
      <div className={`relative min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm ${bubble}`}>
        {/* The bubble's tail, pointing at Kuwi: up on phones, left beside her. */}
        <span aria-hidden className={`absolute -top-1.5 left-5 h-3 w-3 rotate-45 [clip-path:polygon(0_0,100%_0,0_100%)] sm:top-5 sm:-left-1.5 sm:[clip-path:polygon(0_0,0_100%,100%_100%)] ${tail}`} />
        {collapsible ? (
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls={bodyId}
            className={`-mx-1 flex w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-lg px-1 text-left font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}>
            <span className="min-w-0">{title ?? `${MASCOT_NAME}'s tips`}</span>
            <span className={`mt-0.5 flex shrink-0 items-center gap-1 text-xs font-semibold ${muted}`}>
              {open ? 'Hide' : 'Show'} <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </span>
          </button>
        ) : (
          title && <p className="mb-1 font-semibold">{title}</p>
        )}
        <div id={bodyId} className="kuwi-collapse" data-open={open} inert={!open}>
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Kuwi's reasons in a bordered callout, the same shape as KuwiTips, so "against" (red),
 * "in favor" (green) and the tips (amber) read as three separate boxes. A cross or a check on
 * every line too, not only the colour. In a grid row the two boxes stretch to equal height on their own.
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
    <div className={`kuwi-callout rounded-lg border-l-4 px-3 py-2.5 ${t.box}`} role="note" aria-label={heading}>
      <p className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${t.head}`}>
        <Icon className="h-4 w-4" /> {heading}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.length ? items.map((text, i) => (
          <li key={text} className="kuwi-item flex gap-2" style={{ '--i': i } as CSSProperties}><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} /> <span>{text}</span></li>
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
    <div className={`kuwi-callout kuwi-tips mt-3 rounded-lg border-l-4 px-3 py-2.5 ${box}`} role="note" aria-label={title}>
      <p className={`flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase ${head}`}>
        <Lightbulb className="kuwi-bulb h-4 w-4" /> {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {tips.map((t, i) => (
          <li key={t} className="kuwi-item flex gap-2" style={{ '--i': i + 1 } as CSSProperties}><ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 ${head}`} /> <span>{t}</span></li>
        ))}
      </ul>
    </div>
  )
}
