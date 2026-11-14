// Kuwi, UDEI's owl (from "kuwago"), who explains the model's reasons in plain words.
// One drawing for the web (Mascot.tsx) and the phone app (mobile/assets/kuwi-*.png, rendered from this).
// Plain string SVG with no type-only syntax beyond the signature, so Node can run it directly.

export type Mood = 'happy' | 'neutral' | 'concerned'

export const MASCOT_NAME = 'Kuwi'

const C = {
  body: '#15613f',
  wing: '#0b422a',
  belly: '#ecf7f1',
  feather: '#a6d8bd',
  eye: '#ffffff',
  pupil: '#0d1f17',
  beak: '#f59e0b',
  tie: '#10b981',
  cheek: '#fda4af',
}

export function owlSvg(mood: Mood): string {
  const look = mood === 'concerned' ? 1.5 : mood === 'happy' ? -1 : 0
  const brows =
    mood === 'concerned'
      ? `<path d="M25 33 Q32 31 40 27" /><path d="M75 33 Q68 31 60 27" />`
      : mood === 'happy'
        ? `<path d="M25 33 Q33 27 41 32" /><path d="M59 32 Q67 27 75 33" />`
        : `<path d="M25 33 L41 33" /><path d="M59 33 L75 33" />`
  const eye = (cx: number) =>
    mood === 'happy'
      ? // Smiling eyes: closed arcs.
        `<circle cx="${cx}" cy="46" r="12.5" fill="${C.eye}"/><path d="M${cx - 7} 48 Q${cx} 40 ${cx + 7} 48" fill="none" stroke="${C.pupil}" stroke-width="3.2" stroke-linecap="round"/>`
      : `<circle cx="${cx}" cy="46" r="12.5" fill="${C.eye}"/><circle cx="${cx}" cy="${47 + look}" r="6" fill="${C.pupil}"/><circle cx="${cx + 2}" cy="${44.5 + look}" r="2" fill="#fff"/>`
  // Happy: one wing raised in a wave. Concerned: wings held in.
  const leftWing = mood === 'happy'
    ? `<path d="M19 70 Q6 66 5 50 Q5 40 10 38 Q20 46 23 60 Z" fill="${C.wing}"/>`
    : `<ellipse cx="${mood === 'concerned' ? 20 : 18}" cy="68" rx="8" ry="17" fill="${C.wing}" transform="rotate(${mood === 'concerned' ? 8 : 12} 18 68)"/>`
  const rightWing = `<ellipse cx="${mood === 'concerned' ? 80 : 82}" cy="68" rx="8" ry="17" fill="${C.wing}" transform="rotate(${mood === 'concerned' ? -8 : -12} 82 68)"/>`
  const cheeks = mood === 'happy' ? `<ellipse cx="25" cy="59" rx="4" ry="2.5" fill="${C.cheek}" opacity=".8"/><ellipse cx="75" cy="59" rx="4" ry="2.5" fill="${C.cheek}" opacity=".8"/>` : ''
  const sweat = mood === 'concerned' ? `<path d="M80 22 Q83 28 80 30 Q77 28 80 22 Z" fill="#7dd3fc"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${MASCOT_NAME} the owl, ${mood}">
  <path d="M20 26 L27 8 L37 22 Z M80 26 L73 8 L63 22 Z" fill="${C.body}"/>
  <path d="M50 16 C76 16 86 36 86 58 C86 82 70 94 50 94 C30 94 14 82 14 58 C14 36 24 16 50 16 Z" fill="${C.body}"/>
  ${leftWing}${rightWing}
  <ellipse cx="50" cy="74" rx="20" ry="18" fill="${C.belly}"/>
  <path d="M40 70 q3 3 6 0 M54 70 q3 3 6 0 M46 78 q4 3 8 0 M38 80 q3 3 6 0 M56 80 q3 3 6 0" fill="none" stroke="${C.feather}" stroke-width="1.6" stroke-linecap="round"/>
  ${eye(33)}${eye(67)}
  <g fill="none" stroke="${C.wing}" stroke-width="3" stroke-linecap="round">${brows}</g>
  ${cheeks}
  <path d="M45 54 L55 54 L50 62 Z" fill="${C.beak}" stroke="#d97706" stroke-width="1" stroke-linejoin="round"/>
  <path d="M40 64 L50 67 L40 70 Z M60 64 L50 67 L60 70 Z" fill="${C.tie}"/><circle cx="50" cy="67" r="2" fill="#059669"/>
  <path d="M38 93 l-3 4 M42 93 l0 4 M46 93 l3 4 M54 93 l-3 4 M58 93 l0 4 M62 93 l3 4" stroke="${C.beak}" stroke-width="2.4" stroke-linecap="round"/>
  ${sweat}
</svg>`
}
