// Kuwi, UDEI's owl (from "kuwago"), who explains the model's reasons in plain words.
// One drawing for the web (Mascot.tsx, animated by the .kuwi rules in index.css) and the phone app
// (mobile/assets/kuwi-*.png, rendered from this, plus the -blink frames).
// Plain string SVG with no type-only syntax beyond the signatures, so Node can run it directly.
//
// The parts carry class names so CSS can move them: kuwi-shadow, kuwi-body, kuwi-tuft (the leaf),
// kuwi-eyes, kuwi-pupils, kuwi-wing-l, kuwi-wing-r, kuwi-wave (the waving wing), kuwi-sparkle,
// kuwi-sweat. Wings are tilted with SVG rotate(angle cx cy) on the shape inside their group, so CSS
// only ever transforms the group around them.

export type Mood = 'happy' | 'neutral' | 'concerned'

export const MASCOT_NAME = 'Kuwi'

const C = {
  body: '#15613f',
  bodyLight: '#1f7d52',
  wing: '#0b422a',
  disc: '#dcefe4',
  belly: '#ecf7f1',
  feather: '#a6d8bd',
  eye: '#ffffff',
  pupil: '#0d1f17',
  beak: '#f59e0b',
  beakEdge: '#d97706',
  tie: '#10b981',
  cheek: '#fb7185',
  leaf: '#34d399',
  leafVein: '#059669',
  sparkle: '#fbbf24',
  sweat: '#7dd3fc',
}

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`

/** Kuwi as an SVG string, 120 x 120. `blink`: eyes closed (the app's blink frame). */
export function owlSvg(mood: Mood, blink = false): string {
  const lookY = mood === 'concerned' ? 2 : 0
  const eye = (cx: number) => {
    if (mood === 'happy') {
      // Smiling eyes: upturned arcs.
      return `<path d="M${cx - 8} 58 Q${cx} 47 ${cx + 8} 58" fill="none" stroke="${C.pupil}" stroke-width="3.6" stroke-linecap="round"/>`
    }
    if (blink) {
      return `<path d="M${cx - 8.5} 55 Q${cx} 61 ${cx + 8.5} 55" fill="none" stroke="${C.pupil}" stroke-width="3.4" stroke-linecap="round"/>`
    }
    return `<circle cx="${cx}" cy="54" r="12.5" fill="${C.eye}"/>`
  }
  const pupil = (cx: number) =>
    mood === 'happy' || blink
      ? ''
      : `<circle cx="${cx}" cy="${55 + lookY}" r="7.8" fill="${C.pupil}"/><circle cx="${cx + 3}" cy="${51.5 + lookY}" r="2.7" fill="#fff"/><circle cx="${cx - 2.6}" cy="${58 + lookY}" r="1.3" fill="#fff"/>`
  // Worried brows only when concerned.
  const brows =
    mood === 'concerned'
      ? `<g fill="none" stroke="${C.wing}" stroke-width="3" stroke-linecap="round"><path d="M34 37 Q42 36 50 32"/><path d="M86 37 Q78 36 70 32"/></g>`
      : ''
  // Happy: the left wing raised in a wave. Concerned: both held in close.
  const tilt = mood === 'concerned' ? 6 : 14
  const leftWing =
    mood === 'happy'
      ? `<g class="kuwi-wing-l kuwi-wave"><ellipse cx="21" cy="64" rx="8.5" ry="17" fill="${C.wing}" transform="rotate(-32 21 64)"/></g>`
      : `<g class="kuwi-wing-l"><ellipse cx="${mood === 'concerned' ? 26 : 24}" cy="78" rx="9" ry="18" fill="${C.wing}" transform="rotate(${tilt} 24 78)"/></g>`
  const rightWing = `<g class="kuwi-wing-r"><ellipse cx="${mood === 'concerned' ? 94 : 96}" cy="78" rx="9" ry="18" fill="${C.wing}" transform="rotate(${-tilt} 96 78)"/></g>`
  const blush = `<ellipse cx="31" cy="69" rx="5.5" ry="3.2" fill="${C.cheek}" opacity="${mood === 'happy' ? 0.75 : 0.45}"/><ellipse cx="89" cy="69" rx="5.5" ry="3.2" fill="${C.cheek}" opacity="${mood === 'happy' ? 0.75 : 0.45}"/>`
  const sparkles =
    mood === 'happy'
      ? `<g class="kuwi-sparkle"><path d="${star(103, 24, 6)}" fill="${C.sparkle}"/></g><g class="kuwi-sparkle" style="animation-delay:.6s"><path d="${star(13, 30, 4.5)}" fill="${C.sparkle}"/></g><g class="kuwi-sparkle" style="animation-delay:1.2s"><path d="${star(110, 46, 3.5)}" fill="${C.sparkle}"/></g>`
      : ''
  const sweat =
    mood === 'concerned' ? `<path class="kuwi-sweat" d="M99 30 Q103 37 99 40 Q95 37 99 30 Z" fill="${C.sweat}" stroke="#38bdf8" stroke-width=".8"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="kuwi kuwi--${mood}" overflow="visible" role="img" aria-label="${MASCOT_NAME} the owl, ${mood}">
  <ellipse class="kuwi-shadow" cx="60" cy="113" rx="27" ry="4.5" fill="${C.wing}" opacity=".18"/>
  <g class="kuwi-body">
    <path d="M30 34 L33 13 L48 28 Z M90 34 L87 13 L72 28 Z" fill="${C.body}"/>
    <g class="kuwi-tuft">
      <path d="M60 23 Q60 18 62 15" fill="none" stroke="${C.leafVein}" stroke-width="2" stroke-linecap="round"/>
      <path d="M61 16 C61 8 68 4 76 5 C75 13 69 17 61 16 Z" fill="${C.leaf}"/>
      <path d="M62.5 15 Q68 11 73 7.5" fill="none" stroke="${C.leafVein}" stroke-width="1.2" stroke-linecap="round"/>
    </g>
    <path d="M60 20 C89 20 102 42 102 66 C102 94 83 108 60 108 C37 108 18 94 18 66 C18 42 31 20 60 20 Z" fill="${C.body}"/>
    <path d="M60 20 C78 20 89 29 94 40 C82 31 72 28 60 28 C48 28 38 31 26 40 C31 29 42 20 60 20 Z" fill="${C.bodyLight}" opacity=".55"/>
    ${leftWing}${rightWing}
    <ellipse cx="60" cy="88" rx="24" ry="18" fill="${C.belly}"/>
    <path d="M49 85 q3 3 6 0 M65 85 q3 3 6 0 M56 93 q4 3 8 0 M46 94 q3 3 6 0 M68 94 q3 3 6 0" fill="none" stroke="${C.feather}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="43" cy="55" r="18" fill="${C.disc}"/><circle cx="77" cy="55" r="18" fill="${C.disc}"/>
    <g class="kuwi-eyes">${eye(43)}${eye(77)}<g class="kuwi-pupils">${pupil(43)}${pupil(77)}</g></g>
    ${brows}
    ${blush}
    <path d="M55 64 L65 64 L60 71 Z" fill="${C.beak}" stroke="${C.beakEdge}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M51 76 L60 79 L51 82 Z M69 76 L60 79 L69 82 Z" fill="${C.tie}"/><circle cx="60" cy="79" r="2" fill="${C.leafVein}"/>
    <path d="M48 106 l-3 4 M52 107 l0 4 M56 106 l3 4 M64 106 l-3 4 M68 107 l0 4 M72 106 l3 4" stroke="${C.beak}" stroke-width="2.6" stroke-linecap="round"/>
  </g>
  ${sparkles}${sweat}
</svg>`
}
